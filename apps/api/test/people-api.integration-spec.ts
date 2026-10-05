import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('People API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService;
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); });
  afterEach(async () => { await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.clinicalPatient.deleteMany(); await prisma.person.deleteMany(); await prisma.authAttemptBucket.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  afterAll(() => app.close());
  async function session(role: Role) { const user = await users.create({ firstName: 'API', lastName: 'User', email: `${role.toLowerCase()}@people.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  const payload = { firstName: 'Ana', lastName: 'Sintética', dni: '20.123.456', phone: '(341) 555-1234', birthDate: '1992-03-10' };

  it('creates, reads, searches, paginates and updates safe general data', async () => {
    const authn = await session(Role.PROFESSOR);
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    expect(created.body.data).toMatchObject({ firstName: 'Ana', dni: '20123456', phone: '3415551234', birthDate: '1992-03-10', status: 'INACTIVE', contexts: [] });
    expect(created.body.data.initialPin).toMatch(/^\d{4}$/);
    expect(JSON.stringify(created.body)).not.toMatch(/pinHash|passwordHash/);
    const id = created.body.data.id as string;
    const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: id } });
    expect(credential.pinHash).not.toBe(created.body.data.initialPin);
    expect(await argon2.verify(credential.pinHash, created.body.data.initialPin)).toBe(true);
    const detail = await request(app.getHttpServer()).get(`/api/people/${id}`).set('Cookie', authn.cookie).expect(200);
    expect(JSON.stringify(detail.body)).not.toMatch(/normalizedDni|normalizedEmail|createdAt|updatedAt/);
    const list = await request(app.getHttpServer()).get('/api/people?search=20.123&page=1&pageSize=10').set('Cookie', authn.cookie).expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    const updated = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ phone: '3515559999', email: null }).expect(200);
    expect(updated.body.data).toMatchObject({ phone: '3515559999', email: null });
    expect(updated.body.data.initialPin).toBeUndefined();
    const reset = await request(app.getHttpServer()).post(`/api/people/${id}/reset-portal-pin`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201);
    expect(reset.body.data).toMatch(/^\d{4}$/);
    expect(JSON.stringify(reset.body)).not.toMatch(/pinHash|passwordHash/);
    const detailAfterReset = await request(app.getHttpServer()).get(`/api/people/${id}`).set('Cookie', authn.cookie).expect(200);
    expect(detailAfterReset.body.data.initialPin).toBeUndefined();
  });

  it('returns stable duplicate and validation errors', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    const duplicate = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, dni: '20123456' }).expect(409);
    expect(duplicate.body.code).toBe('PERSON_DNI_ALREADY_EXISTS');
    await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, birthDate: 'not-a-date' }).expect(400);
  });

  it.each(['123456', '1234567', '20123456', '20.123.456', '20 123 456', '20-123-456'])('accepts and persists canonical DNI %s', async (dni) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, dni }).expect(201);
    const canonical = dni.replace(/[^0-9]/g, '');
    expect(result.body.data.dni).toBe(canonical);
    expect(await prisma.person.findUniqueOrThrow({ where: { id: result.body.data.id } })).toMatchObject({ dni: canonical, normalizedDni: canonical });
  });

  it.each(['12345', '123456789', '20abc123456', '', '20/123/456'])('rejects invalid DNI %s before persistence', async (dni) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, dni }).expect(400);
    expect(result.body.code).toBe('PERSON_DNI_INVALID');
    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.portalCredential.count()).toBe(0);
  });

  it.each(['3415551234', '1112345678', '(341) 555-1234', '341 555 1234', '11 1234-5678', '341.555.1234', '3411551234'])('accepts and persists national phone %s', async (phone) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, phone }).expect(201);
    const canonical = phone.replace(/[^0-9]/g, '');
    expect(result.body.data.phone).toBe(canonical);
    expect(await prisma.person.findUniqueOrThrow({ where: { id: result.body.data.id } })).toMatchObject({ phone: canonical });
  });

  it.each(['341555123', '34155512345', '0341555123', '0341 5551234', '+54 9 11 1234 5678', '341abc5551234', '', '341/5551234'])('rejects invalid phone %s before persistence', async (phone) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, phone }).expect(400);
    expect(result.body.code).toBe('PERSON_PHONE_INVALID');
    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.portalCredential.count()).toBe(0);
  });

  it('normalizes edited identity and both phones, and preserves duplicate conflicts', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    const id = created.body.data.id as string;
    const edited = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ dni: '1.234.567', phone: '11 1234-5678', emergencyContactPhone: '(341) 555-1234' }).expect(200);
    const canonical = { dni: '1234567', phone: '1112345678', emergencyContactPhone: '3415551234' };
    expect(edited.body.data).toMatchObject(canonical);
    expect(await prisma.person.findUniqueOrThrow({ where: { id } })).toMatchObject({ ...canonical, normalizedDni: '1234567' });
    for (const [input, code] of [
      [{ dni: '12345' }, 'PERSON_DNI_INVALID'],
      [{ dni: null }, 'PERSON_DNI_INVALID'],
      [{ phone: '341abc5551234' }, 'PERSON_PHONE_INVALID'],
      [{ phone: null }, 'PERSON_PHONE_INVALID'],
      [{ emergencyContactPhone: '+54 3415551234' }, 'PERSON_EMERGENCY_PHONE_INVALID'],
    ] as const) {
      const rejected = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input).expect(400);
      expect(rejected.body.code).toBe(code);
      expect(await prisma.person.findUniqueOrThrow({ where: { id } })).toMatchObject({ ...canonical, normalizedDni: '1234567' });
    }
    await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    const duplicate = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ dni: '20123456' }).expect(409);
    expect(duplicate.body.code).toBe('PERSON_DNI_ALREADY_EXISTS');
    const cleared = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ emergencyContactPhone: ' ' }).expect(200);
    expect(cleared.body.data.emergencyContactPhone).toBeNull();
  });

  it.each([['(341) 555-1234', '3415551234'], ['', null], [' ', null]])('handles optional emergency phone %s', async (emergencyContactPhone, expected) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, emergencyContactPhone }).expect(201);
    expect(result.body.data.emergencyContactPhone).toBe(expected);
    expect(await prisma.person.findUniqueOrThrow({ where: { id: result.body.data.id } })).toMatchObject({ emergencyContactPhone: expected });
  });

  it.each(['341555123', '34155512345', '0341555123', '+54 3415551234', '341abc5551234'])('rejects invalid emergency phone %s', async (emergencyContactPhone) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, emergencyContactPhone }).expect(400);
    expect(result.body.code).toBe('PERSON_EMERGENCY_PHONE_INVALID');
    expect(await prisma.person.count()).toBe(0);
  });

  function operationalDates() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return { today, tomorrow: tomorrow.toISOString().slice(0, 10) };
  }

  it('rejects future birth dates on creation', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const { tomorrow } = operationalDates();
    const result = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, birthDate: tomorrow }).expect(400);
    expect(result.body.code).toBe('PERSON_BIRTH_DATE_FUTURE');
    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.portalCredential.count()).toBe(0);
  });

  it('rejects future birth dates on update without changing the stored date', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    const id = created.body.data.id as string;
    const { tomorrow } = operationalDates();
    const result = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ birthDate: tomorrow }).expect(400);
    expect(result.body.code).toBe('PERSON_BIRTH_DATE_FUTURE');
    const stored = await prisma.person.findUniqueOrThrow({ where: { id } });
    expect(stored.birthDate.toISOString().slice(0, 10)).toBe(payload.birthDate);
    const missing = await request(app.getHttpServer()).patch('/api/people/10000000-0000-4000-8000-000000000099').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ birthDate: tomorrow }).expect(404);
    expect(missing.body.code).toBe('PERSON_NOT_FOUND');
  });

  it('accepts today in the operational timezone on creation and update', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const { today } = operationalDates();
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...payload, birthDate: today }).expect(201);
    expect(created.body.data.birthDate).toBe(today);
    const id = created.body.data.id as string;
    await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ birthDate: payload.birthDate }).expect(200);
    const updated = await request(app.getHttpServer()).patch(`/api/people/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ birthDate: today }).expect(200);
    expect(updated.body.data.birthDate).toBe(today);
  });

  it('enforces read and mutation permissions at the backend boundary', async () => {
    await request(app.getHttpServer()).get('/api/people').expect(401);
    const support = await session(Role.BROCO_SUPPORT);
    await request(app.getHttpServer()).get('/api/people').set('Cookie', support.cookie).expect(403);
    await request(app.getHttpServer()).post('/api/people').set('Cookie', support.cookie).set('x-csrf-token', support.csrf).send(payload).expect(403);
  });

  it('allows Administrative to read the operational patient overview without clinical-history fields', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/clinic/patients').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ personId: created.body.data.id }).expect(201);

    const overview = await request(app.getHttpServer()).get('/api/clinic/patients/overview?treatmentInProgress=NO&page=1&pageSize=10').set('Cookie', administrative.cookie).expect(200);
    expect(overview.body).toMatchObject({ data: [expect.objectContaining({ id: created.body.data.id, status: 'INACTIVE', lastAttentionAt: null })], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
    expect(JSON.stringify(overview.body)).not.toMatch(/consultationReason|bodyAreaOrInjury|evolution|evaluation|interventionPlan/i);

    const professor = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).get('/api/clinic/patients/overview').set('Cookie', professor.cookie).expect(403);
  });
});
