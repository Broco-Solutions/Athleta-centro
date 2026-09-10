import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('Team management API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService;
  const combinedClinicalDni = '44999111';
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); });
  afterEach(async () => { await prisma.clinicalAppointment.deleteMany({ where: { person: { normalizedDni: combinedClinicalDni } } }); await prisma.treatment.deleteMany({ where: { person: { normalizedDni: combinedClinicalDni } } }); await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.person.deleteMany({ where: { normalizedDni: combinedClinicalDni } }); await prisma.authAttemptBucket.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); }); afterAll(() => app.close());
  async function actor(role: Role, suffix = role.toLowerCase()) { const user = await users.create({ firstName: 'Actor', lastName: 'Sintético', email: `${suffix}@team.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { user, cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  const standard = { firstName: 'Nueva', lastName: 'Profesional', email: 'new.professional@team.test', roles: [Role.PROFESSOR] };

  it('creates a standard user with a one-time generated temporary credential', async () => { const admin = await actor(Role.ADMINISTRATIVE); const response = await request(app.getHttpServer()).post('/api/team/users').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send(standard).expect(201); expect(response.body.data).toMatchObject({ email: standard.email, roles: [Role.PROFESSOR], status: 'ACTIVE' }); expect(response.body.temporaryPassword).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/); const credential = await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: response.body.data.id } }); expect(credential.passwordHash).not.toBe(response.body.temporaryPassword); expect(credential.mustChangePassword).toBe(true); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: standard.email, password: response.body.temporaryPassword }).expect(200); expect(login.body.data.mustChangePassword).toBe(true); });
  it('returns a stable conflict when the normalized email already exists', async () => { const admin = await actor(Role.ADMINISTRATIVE); await users.create(standard); const response = await request(app.getHttpServer()).post('/api/team/users').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ ...standard, email: 'NEW.PROFESSIONAL@TEAM.TEST' }).expect(409); expect(response.body.code).toBe('INTERNAL_USER_EMAIL_EXISTS'); });
  it('lists only safe team data', async () => { const admin = await actor(Role.ADMINISTRATIVE); const response = await request(app.getHttpServer()).get('/api/team/users').set('Cookie', admin.cookie).expect(200); expect(response.body.data[0]).toEqual(expect.objectContaining({ id: admin.user.id, roles: [Role.ADMINISTRATIVE] })); expect(JSON.stringify(response.body)).not.toMatch(/password|credential|session|Hash/); });
  it('enforces standard, general-admin and support privilege boundaries', async () => { const admin = await actor(Role.ADMINISTRATIVE); await request(app.getHttpServer()).post('/api/team/users').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ ...standard, roles: [Role.GENERAL_ADMIN] }).expect(403); const general = await actor(Role.GENERAL_ADMIN, 'general'); await request(app.getHttpServer()).post('/api/team/users').set('Cookie', general.cookie).set('x-csrf-token', general.csrf).send({ ...standard, email: 'general.new@team.test', roles: [Role.GENERAL_ADMIN] }).expect(201); await request(app.getHttpServer()).post('/api/team/users').set('Cookie', general.cookie).set('x-csrf-token', general.csrf).send({ ...standard, email: 'support.new@team.test', roles: [Role.BROCO_SUPPORT] }).expect(403); });
  it('uses explicit role actions and blocks the last role of an active account', async () => { const admin = await actor(Role.ADMINISTRATIVE); const target = await users.create(standard); await request(app.getHttpServer()).post(`/api/team/users/${target.id}/roles`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ role: Role.KINESIOLOGIST }).expect(200); await request(app.getHttpServer()).post(`/api/team/users/${target.id}/roles/remove`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ role: Role.PROFESSOR }).expect(200); const blocked = await request(app.getHttpServer()).post(`/api/team/users/${target.id}/roles/remove`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ role: Role.KINESIOLOGIST }).expect(409); expect(blocked.body.code).toBe('ACTIVE_USER_REQUIRES_ROLE'); });
  it('allows removing one clinical role but blocks removing the last one with active responsibilities', async () => {
    const admin = await actor(Role.ADMINISTRATIVE);
    const target = await users.create({ firstName: 'Profesional', lastName: 'Combinado', email: 'clinical-combined@team.test', roles: [Role.KINESIOLOGIST, Role.OSTEOPATH] });
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Sintético', dni: combinedClinicalDni, normalizedDni: combinedClinicalDni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.treatment.create({ data: { personId: person.id, responsibleProfessionalId: target.id, consultationReason: 'Seguimiento sintético', bodyAreaOrInjury: 'Rodilla', startDate: new Date('2026-01-01') } });
    await prisma.clinicalAppointment.create({ data: { personId: person.id, professionalId: target.id, startAt: new Date(Date.now() + 86_400_000) } });

    const removed = await request(app.getHttpServer()).post(`/api/team/users/${target.id}/roles/remove`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ role: Role.KINESIOLOGIST }).expect(200);
    expect(removed.body.data.roles).toEqual([Role.OSTEOPATH]);

    const blocked = await request(app.getHttpServer()).post(`/api/team/users/${target.id}/roles/remove`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ role: Role.OSTEOPATH }).expect(409);
    expect(blocked.body.code).toBe('USER_HAS_CLINICAL_RESPONSIBILITIES');
  });
  it('preserves roles, revokes sessions on inactivation and requires roles for reactivation', async () => { const admin = await actor(Role.ADMINISTRATIVE); const targetAuth = await actor(Role.PROFESSOR, 'target'); await request(app.getHttpServer()).post(`/api/team/users/${targetAuth.user.id}/inactivate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).expect(200); await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', targetAuth.cookie).expect(401); expect(await prisma.internalUserRole.count({ where: { internalUserId: targetAuth.user.id } })).toBe(1); await users.removeRole(targetAuth.user.id, Role.PROFESSOR); const blocked = await request(app.getHttpServer()).post(`/api/team/users/${targetAuth.user.id}/reactivate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).expect(409); expect(blocked.body.code).toBe('ACTIVE_USER_REQUIRES_ROLE'); });
  it('allows self profile correction but not management of another account without permission', async () => { const professor = await actor(Role.PROFESSOR); await request(app.getHttpServer()).patch(`/api/team/users/${professor.user.id}`).set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ firstName: 'Corregido' }).expect(200); const other = await users.create({ ...standard, email: 'other@team.test' }); await request(app.getHttpServer()).patch(`/api/team/users/${other.id}`).set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ firstName: 'No permitido' }).expect(403); await request(app.getHttpServer()).get('/api/team/users').set('Cookie', professor.cookie).expect(403); });
  it('allows a standard user to manage only their complete profile through the session-derived endpoint', async () => {
    const professor = await actor(Role.PROFESSOR);
    const me = await request(app.getHttpServer()).get('/api/team/users/me').set('Cookie', professor.cookie).expect(200);
    expect(me.body.data).toMatchObject({ id: professor.user.id, phone: null, dni: null, address: null, birthDate: null, profession: null, athletaStartDate: null });

    const updated = await request(app.getHttpServer()).patch('/api/team/users/me').set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ phone: '351 555 0101', dni: combinedClinicalDni, address: 'Av. Sintética 123', birthDate: '1990-05-20', profession: 'Profesor', athletaStartDate: '2020-06-15' }).expect(200);
    expect(updated.body.data).toMatchObject({ phone: '351 555 0101', dni: combinedClinicalDni, address: 'Av. Sintética 123', birthDate: '1990-05-20', profession: 'Profesor', athletaStartDate: '2020-06-15' });

    await request(app.getHttpServer()).patch('/api/team/users/me').set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ phone: null, roles: [Role.GENERAL_ADMIN], status: 'INACTIVE' }).expect(400);
    expect((await prisma.internalUser.findUniqueOrThrow({ where: { id: professor.user.id } })).phone).toBe('351 555 0101');
  });
  it('keeps Team DNI independent from Person DNI and rejects future profile dates', async () => {
    const admin = await actor(Role.ADMINISTRATIVE);
    await prisma.person.create({ data: { firstName: 'Persona', lastName: 'Sintética', dni: combinedClinicalDni, normalizedDni: combinedClinicalDni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    const first = await request(app.getHttpServer()).post('/api/team/users').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ ...standard, dni: combinedClinicalDni, phone: '351 555 0101', birthDate: '1990-05-20', athletaStartDate: '2020-06-15' }).expect(201);
    await request(app.getHttpServer()).post('/api/team/users').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ ...standard, email: 'same-dni@team.test', dni: combinedClinicalDni }).expect(201);
    expect(first.body.data.dni).toBe(combinedClinicalDni);
    const futureBirth = await request(app.getHttpServer()).patch(`/api/team/users/${first.body.data.id}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ birthDate: '9999-01-01' }).expect(400);
    expect(futureBirth.body.code).toBe('INTERNAL_USER_BIRTH_DATE_IN_FUTURE');
    const futureStart = await request(app.getHttpServer()).patch(`/api/team/users/${first.body.data.id}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ athletaStartDate: '9999-01-01' }).expect(400);
    expect(futureStart.body.code).toBe('INTERNAL_USER_START_DATE_IN_FUTURE');
  });
  it('uses the updated unique email as the next login identifier and protects general administrators from Administrative edits', async () => {
    const professor = await actor(Role.PROFESSOR, 'email-change');
    await request(app.getHttpServer()).patch('/api/team/users/me').set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ email: 'renamed@team.test' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'email-change@team.test', password: 'ValidPass1!' }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'renamed@team.test', password: 'ValidPass1!' }).expect(200);
    const admin = await actor(Role.ADMINISTRATIVE);
    const general = await actor(Role.GENERAL_ADMIN, 'protected-general');
    await request(app.getHttpServer()).patch(`/api/team/users/${general.user.id}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ phone: '351 555 0101' }).expect(403);
  });
  it('resets a standard credential, revokes sessions and returns the temporary password once', async () => {
    const admin = await actor(Role.ADMINISTRATIVE);
    const target = await actor(Role.PROFESSOR, 'credential-target');
    const response = await request(app.getHttpServer()).post(`/api/team/users/${target.user.id}/reset-credential`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).expect(200);
    expect(response.body.temporaryPassword).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/);
    await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', target.cookie).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: target.user.email, password: response.body.temporaryPassword }).expect(200);
    expect(login.body.data.mustChangePassword).toBe(true);
  });
});
