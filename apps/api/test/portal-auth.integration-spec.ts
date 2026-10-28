import { createHash } from 'node:crypto';
import { PORTAL_SESSION_TTL_MS } from '../src/portal/portal-session';
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
    const cookie = (login.headers['set-cookie'][0] as string).split(';')[0]!;
    const csrf = login.body.data.csrfToken as string;
    const plan = await prisma.salaPlan.create({ data: { name: `Portal plan ${Date.now()}`, monthlyAmount: 1000 } });
    const personDni = `${Date.now()}`.slice(-8);
    const person = await prisma.person.create({ data: { firstName: 'Portal', lastName: 'Person', dni: personDni, normalizedDni: personDni, phone: '3515550000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111', { type: argon2.argon2id }), mustChangePin: false } } } });
    await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: admin.id, planId: plan.id, startDate: new Date('2020-01-01') } });

    const initial = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: '1111' }).expect(200);
    expect(initial.body.data.mustChangePin).toBe(false);
    const initialCookie = initial.headers['set-cookie'][0] as string;
    expect(initialCookie).toContain('Max-Age=2592000');
    expect(initialCookie).toContain('HttpOnly');
    expect(initialCookie).toContain('SameSite=Lax');
    expect(initialCookie).toContain('Path=/');
    const token = decodeURIComponent(initialCookie.split(';')[0]!.split('=')[1]!);
    const portalSession = await prisma.session.findUniqueOrThrow({ where: { secretHash: createHash('sha256').update(token).digest('hex') } });
    expect(Math.abs(portalSession.expiresAt.getTime() - Date.now() - PORTAL_SESSION_TTL_MS)).toBeLessThan(10_000);
    await prisma.session.update({ where: { id: portalSession.id }, data: { expiresAt: new Date(Date.now() + 60_000), lastActivityAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) } });
    const renewed = await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(200);
    expect(renewed.headers['set-cookie'][0]).toContain('Max-Age=2592000');
    expect(renewed.headers['set-cookie'][0].split(';')[0]).toBe(initialCookie.split(';')[0]);
    const renewedSession = await prisma.session.findUniqueOrThrow({ where: { id: portalSession.id } });
    expect(Math.abs(renewedSession.expiresAt.getTime() - Date.now() - PORTAL_SESSION_TTL_MS)).toBeLessThan(10_000);
    expect(Date.now() - renewedSession.lastActivityAt.getTime()).toBeLessThan(10_000);
    await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: portalSession.id } })).expiresAt).toEqual(renewedSession.expiresAt);
    const uncovered = await request(app.getHttpServer()).get('/api/portal/me').set('Cookie', initialCookie).expect(200);
    expect(uncovered.body.data.socialWorkName).toBeUndefined();
    expect(uncovered.body.data.affiliateNumber).toBeUndefined();
    const work = await prisma.socialWork.create({ data: { name: 'Obra Social Sintética', normalizedName: `portal-work-${Date.now()}`, isSelectable: false } });
    await prisma.person.update({ where: { id: person.id }, data: { socialWorkId: work.id, affiliateNumber: 'ABC-123' } });
    const covered = await request(app.getHttpServer()).get('/api/portal/me').set('Cookie', initialCookie).expect(200);
    expect(covered.body.data).toMatchObject({ socialWorkName: 'Obra Social Sintética', affiliateNumber: 'ABC-123' });
    const coveredSession = await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(200);
    expect(coveredSession.body.data.person.socialWorkName).toBe(work.name);

    const internalDenied = await request(app.getHttpServer()).post(`/api/people/${person.id}/reset-portal-pin`).set('Cookie', cookie).expect(401);
    expect(internalDenied.body.code).toBe('CSRF_INVALID');
    const previousOrigin = process.env.WEB_ORIGIN;
    const origin = new URL(previousOrigin!).origin;
    let newPin: string;
    try {
      process.env.WEB_ORIGIN = `${origin}/`;
      const reset = await request(app.getHttpServer()).post(`/api/people/${person.id}/reset-portal-pin`).set('Origin', origin).set('Cookie', cookie).set('x-csrf-token', csrf).expect(201);
      newPin = reset.body.data as string;
    } finally { process.env.WEB_ORIGIN = previousOrigin; }
    await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(401);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: portalSession.id } })).revokedAt).not.toBeNull();
    await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200);
    expect(newPin).toMatch(/^\d{4}$/);
    const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: person.id } });
    expect(await argon2.verify(credential.pinHash, newPin)).toBe(true);
    const invalid = await request(app.getHttpServer()).post('/api/portal/auth/login').set('Cookie', cookie).send({ dni: person.dni, pin: '1111' }).expect(401);
    expect(invalid.body.code).toBe('PORTAL_INVALID_CREDENTIALS');
    const temporary = await request(app.getHttpServer()).post('/api/portal/auth/login').set('Cookie', cookie).send({ dni: person.dni, pin: newPin }).expect(200);
    expect(temporary.body.data.mustChangePin).toBe(true);
    expect(temporary.body.data.person.socialWorkName).toBe(work.name);
    const portalCookie = (temporary.headers['set-cookie'][0] as string).split(';')[0]!;
    const bothCookies = `${cookie}; ${portalCookie}`;
    await request(app.getHttpServer()).get('/api/portal/me').set('Cookie', portalCookie).expect(200);
    const portalCsrf = temporary.body.data.csrfToken as string;
    expect(portalCsrf).not.toBe(csrf);
    const portalDenied = await request(app.getHttpServer()).post('/api/portal/auth/change-pin').set('Cookie', bothCookies).set('x-csrf-token', 'invalid-portal-csrf').send({ currentPin: newPin, nextPin: '4321' }).expect(403);
    expect(portalDenied.body.code).toBe('CSRF_INVALID');
    await request(app.getHttpServer()).post('/api/portal/auth/change-pin').set('Cookie', bothCookies).set('x-csrf-token', portalCsrf).send({ currentPin: newPin, nextPin: '4321' }).expect(200);
    await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: newPin }).expect(401);
    await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni: person.dni, pin: '4321' }).expect(200);

    await prisma.session.update({ where: { id: portalSession.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(401);
    expect(expired.headers['set-cookie']).toBeUndefined();
    expect((await prisma.session.findUniqueOrThrow({ where: { id: portalSession.id } })).expiresAt.getTime()).toBeLessThan(Date.now());
    await prisma.session.update({ where: { id: portalSession.id }, data: { expiresAt: new Date(Date.now() + PORTAL_SESSION_TTL_MS), revokedAt: new Date() } });
    const revoked = await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', initialCookie).expect(401);
    expect(revoked.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer()).post('/api/portal/auth/logout').set('Cookie', portalCookie).expect(200);
    await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', portalCookie).expect(401);

    await prisma.session.deleteMany({ where: { personId: person.id } });
    await prisma.salaParticipation.deleteMany({ where: { personId: person.id } });
    await prisma.portalCredential.deleteMany({ where: { personId: person.id } });
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.socialWork.delete({ where: { id: work.id } });
    await prisma.salaPlan.delete({ where: { id: plan.id } });
    await prisma.session.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: admin.id } });
    await prisma.internalUser.delete({ where: { id: admin.id } });
  });
});
