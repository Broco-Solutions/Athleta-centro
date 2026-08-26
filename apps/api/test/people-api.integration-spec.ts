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
  afterEach(async () => { await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.person.deleteMany(); await prisma.authAttemptBucket.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  afterAll(() => app.close());
  async function session(role: Role) { const user = await users.create({ firstName: 'API', lastName: 'User', email: `${role.toLowerCase()}@people.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  const payload = { context: 'SALA', firstName: 'Ana', lastName: 'Sintética', dni: '20.123.456', phone: '3515550102', birthDate: '1992-03-10' };

  it('creates, reads, searches, paginates and updates safe general data', async () => {
    const authn = await session(Role.PROFESSOR);
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(payload).expect(201);
    expect(created.body.data).toMatchObject({ firstName: 'Ana', dni: payload.dni, birthDate: '1992-03-10', status: 'INACTIVE', contexts: [] });
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

  it('enforces read and mutation permissions at the backend boundary', async () => {
    await request(app.getHttpServer()).get('/api/people').expect(401);
    const support = await session(Role.BROCO_SUPPORT);
    await request(app.getHttpServer()).get('/api/people').set('Cookie', support.cookie).expect(403);
    await request(app.getHttpServer()).post('/api/people').set('Cookie', support.cookie).set('x-csrf-token', support.csrf).send(payload).expect(403);
  });
});
