import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { SalaService } from '../src/sala/sala.service';

describe('Sala configuration API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService; let sala: SalaService;
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); sala = app.get(SalaService); });
  afterEach(async () => { await prisma.salaParticipation.deleteMany(); await prisma.salaScheduleException.deleteMany(); await prisma.salaScheduleSlot.deleteMany(); await prisma.salaPlan.deleteMany(); await prisma.salaConfiguration.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); await prisma.portalCredential.deleteMany(); await prisma.person.deleteMany(); });
  afterAll(() => app.close());
  const uniqueDni = () => `${Date.now()}${Math.floor(Math.random() * 10)}`.slice(-8);
  async function session(role: Role) { const user = await users.create({ firstName: 'Sala', lastName: 'User', email: `${role.toLowerCase()}@sala.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('configures positive capacity, plans, slots and explicit closure/override exceptions', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 12 }).expect(200);
    const plan = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 30000 }).expect(201);
    expect(plan.body.data.monthlyAmount).toBe('30000');
    const slot = await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 }).expect(201);
    await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-01', type: 'CLOSURE' }).expect(201);
    const override = await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-02', type: 'CAPACITY_OVERRIDE', capacityOverride: 4 }).expect(201);
    expect(override.body.data.capacityOverride).toBe(4);
  });
  it('rejects non-positive capacities and overlapping slots', async () => {
    const authn = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 0 }).expect(400);
    await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 60, specificCapacity: 0 }).expect(400);
    await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 60 }).expect(201);
    const overlap = await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:30', durationMinutes: 30 }).expect(409);
    expect(overlap.body.code).toBe('SALA_SCHEDULE_OVERLAP');
  });
  it('enforces catalog permissions independently from schedule permissions', async () => {
    const authn = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1 }).expect(403);
  });
  it('joins, leaves, preserves history and allows re-entry with new assignments', async () => {
    const authn = await session(Role.ADMINISTRATIVE); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Ana', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1990-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Plan', monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Uno', email: `prof-one-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const joined = await request(app.getHttpServer()).post('/api/sala/participations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-10' }).expect(201); expect(joined.body.data.endDate).toBeNull();
    await request(app.getHttpServer()).post(`/api/sala/participations/${joined.body.data.id}/leave`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201); expect(await sala.hasActiveSalaParticipation(person.id)).toBe(false); await request(app.getHttpServer()).post(`/api/sala/participations/${joined.body.data.id}/leave`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(404);
    const plan2 = await prisma.salaPlan.create({ data: { name: 'Plan 2', monthlyAmount: 2000 } }); const professor2 = await users.create({ firstName: 'Prof', lastName: 'Dos', email: 'prof-two@sala.test', roles: [Role.PROFESSOR] }); const reentry = await sala.join({ personId: person.id, planId: plan2.id, mainProfessorId: professor2.id, startDate: '2026-02-01' }); const history = await sala.listParticipations(person.id); expect(history).toHaveLength(2); expect(history[0]?.id).toBe(reentry.id); expect(history[1]?.endDate).not.toBeNull();
  });
  it('rejects invalid professor and duplicate active participation at the application boundary', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Dos', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Plan', monthlyAmount: 1000 } }); const admin = await users.create({ firstName: 'Admin', lastName: 'Sala', email: `admin-two-${dni}@sala.test`, roles: [Role.ADMINISTRATIVE] }); const professor = await users.create({ firstName: 'Prof', lastName: 'Valid', email: `prof-valid-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-02' })).rejects.toMatchObject({ response: { code: 'SALA_ACTIVE_PARTICIPATION_EXISTS' } }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: admin.id, startDate: '2026-01-02' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } });
  });
  it('rejects inactive and non-professor main professors', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Invalid', lastName: 'Professor', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Invalid-${dni}`, monthlyAmount: 1000 } }); const inactive = await users.create({ firstName: 'Inactive', lastName: 'Professor', email: `inactive-${dni}@sala.test`, roles: [Role.PROFESSOR] }); await prisma.internalUser.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } }); const administrative = await users.create({ firstName: 'Administrative', lastName: 'User', email: `admin-${dni}@sala.test`, roles: [Role.ADMINISTRATIVE] });
    await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: inactive.id, startDate: '2026-01-01' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: administrative.id, startDate: '2026-01-01' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } });
  });
  it('protects one active participation under concurrent joins with PostgreSQL unique index', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Concurrent', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Concurrent', monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Concurrent', email: `prof-concurrent-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const results = await Promise.allSettled([sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-03-01' }), sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-03-01' })]); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.salaParticipation.count({ where: { personId: person.id, endDate: null } })).toBe(1);
  });
  it('enforces the partial unique index when persistence bypasses the service', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Direct', lastName: 'Constraint', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Direct-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Direct', email: `prof-direct-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    await prisma.salaParticipation.create({ data: { personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: new Date('2026-01-01T00:00:00Z') } });
    await expect(prisma.salaParticipation.create({ data: { personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: new Date('2026-01-02T00:00:00Z') } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.salaParticipation.count({ where: { personId: person.id, endDate: null } })).toBe(1);
  });
});
