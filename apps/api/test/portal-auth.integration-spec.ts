import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Portal auth and PIN reset', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: InternalUserService;
  let auth: AuthService;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(InternalUserService);
    auth = app.get(AuthService);
  });

  afterAll(() => app.close());

  it('resets an active person PIN and the returned PIN logs in immediately', async () => {
    const admin = await users.create({ firstName: 'Portal', lastName: 'Admin', email: `portal-reset-${Date.now()}@test.local`, roles: [Role.GENERAL_ADMIN] });
    await auth.provisionCredential(admin.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: admin.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: admin.email, password: 'ValidPass1!' }).expect(200);
    const cookie = login.headers['set-cookie'][0] as string;
    const csrf = login.body.data.csrfToken as string;
    const plan = await prisma.salaPlan.create({ data: { name: `Portal plan ${Date.now()}`, monthlyAmount: 1000 } });
    const person = await prisma.person.create({ data: { firstName: 'Portal', lastName: 'Person', dni: `${Date.now()}`.slice(-8), normalizedDni: `${Date.now()}`.slice(-8), phone: '3515550000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111', { type: argon2.argon2id }), mustChangePin: false } } } });
    await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: admin.id, planId: plan.id, startDate: new Date('2020-01-01') } });

    const initial = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: '1111' }).expect(200);
    expect(initial.body.data.mustChangePin).toBe(false);
    const reset = await request(app.getHttpServer()).post(`/api/people/${person.id}/reset-portal-pin`).set('Cookie', cookie).set('x-csrf-token', csrf).expect(201);
    const newPin = reset.body.data as string;
    expect(newPin).toMatch(/^\d{4}$/);
    const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: person.id } });
    expect(await argon2.verify(credential.pinHash, newPin)).toBe(true);
    await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: '1111' }).expect(401);
    const temporary = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: newPin }).expect(200);
    expect(temporary.body.data.mustChangePin).toBe(true);
    const portalCookie = temporary.headers['set-cookie'][0] as string;
    await request(app.getHttpServer()).get('/api/portal/me').set('Cookie', portalCookie).expect(200);
    const portalCsrf = temporary.body.data.csrfToken as string;
    await request(app.getHttpServer()).post('/api/portal/auth/change-pin').set('Cookie', portalCookie).set('x-csrf-token', portalCsrf).send({ currentPin: newPin, nextPin: '4321' }).expect(200);
    await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: newPin }).expect(401);
    await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: '4321' }).expect(200);

    await prisma.session.deleteMany({ where: { personId: person.id } });
    await prisma.salaParticipation.deleteMany({ where: { personId: person.id } });
    await prisma.portalCredential.deleteMany({ where: { personId: person.id } });
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.salaPlan.delete({ where: { id: plan.id } });
    await prisma.session.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalUser.delete({ where: { id: admin.id } });
  });
});
