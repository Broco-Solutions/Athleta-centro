import request from 'supertest';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Role, SessionKind } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService, INTERNAL_SESSION_TTL_MS } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('internal auth API', () => {
  let app: INestApplication; let auth: AuthService; let users: InternalUserService; let prisma: PrismaService;
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api'); await app.init(); auth = app.get(AuthService); users = app.get(InternalUserService); prisma = app.get(PrismaService); });
  afterEach(async () => { await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.authAttemptBucket.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  afterAll(() => app.close());
  async function fixture(mustChangePassword = false) { const user = await users.create({ firstName: 'Auth', lastName: 'Test', email: 'auth@test.local', roles: [Role.PROFESSOR] }); await auth.provisionCredential(user.id, 'ValidPass1!'); if (!mustChangePassword) await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); return user; }
  it('logs in safely and stores only a token hash', async () => { const user = await fixture(); const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); expect(response.body.data.user).toMatchObject({ id: user.id, email: user.email }); expect(response.body).not.toHaveProperty('passwordHash'); expect(response.headers['set-cookie'][0]).toContain('HttpOnly'); const raw = response.headers['set-cookie'][0].split(';')[0].split('=')[1]; const session = await prisma.session.findFirstOrThrow(); expect(session.secretHash).not.toBe(raw); });
  it('does not enumerate invalid credentials or inactive users', async () => { const user = await fixture(); const bad = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'wrong' }).expect(401); const unknown = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'none@test.local', password: 'wrong' }).expect(401); await users.inactivate(user.id); const inactive = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(401); expect(bad.body).toEqual(unknown.body); expect(inactive.body).toEqual(unknown.body); });
  it('rejects missing, random, revoked and expired session cookies without exposing credential internals', async () => { const user = await fixture(); await request(app.getHttpServer()).get('/api/auth/session').expect(401); await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', 'athleta_session=not-a-real-token').expect(401); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); const cookie = login.headers['set-cookie'][0]; const current = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200); for (const field of ['password', 'passwordHash', 'credential', 'credentialHash', 'token', 'tokenHash', 'secretHash', 'sessionToken', 'sessionTokenHash']) expect(JSON.stringify(current.body)).not.toContain(field); const session = await prisma.session.findFirstOrThrow(); await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }); await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(401); });
  it('invalidates a session on inactivation and never restores it on reactivation', async () => { const user = await fixture(); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); const cookie = login.headers['set-cookie'][0]; await users.inactivate(user.id); await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(401); await users.reactivate(user.id); await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(401); });
  it('returns a stable 429 envelope after progressive authentication lockout', async () => { const user = await fixture(); for (let attempt = 0; attempt < 5; attempt += 1) await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'wrong' }).expect(401); const locked = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'wrong' }).expect(429); expect(locked.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMIT_EXCEEDED' }); });
  it('requires session and valid CSRF to change password', async () => { const user = await fixture(true); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }); const cookie = login.headers['set-cookie'][0]; const current = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200); expect(current.body.data.mustChangePassword).toBe(true); await request(app.getHttpServer()).post('/api/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'ValidPass1!', nextPassword: 'NewValid1!' }).expect(401); await request(app.getHttpServer()).post('/api/auth/change-password').set('Cookie', cookie).set('x-csrf-token', login.body.data.csrfToken).send({ currentPassword: 'ValidPass1!', nextPassword: 'NewValid1!' }).expect(200); await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(401); await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'NewValid1!' }).expect(200); });
  async function loginSession() {
    const user = await fixture();
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    const cookie = response.headers['set-cookie'][0];
    return { user, response, cookie, token: cookie.split(';')[0].split('=')[1], session: await prisma.session.findFirstOrThrow() };
  }
  it('persists a 30-day cookie and avoids renewal writes before the daily threshold', async () => {
    const { cookie, session } = await loginSession();
    expect(cookie).toContain(`Max-Age=${INTERNAL_SESSION_TTL_MS / 1000}`);
    expect(cookie).toContain('SameSite=Lax'); expect(cookie).toContain('Path=/'); expect(cookie).toContain('Expires=');
    expect(Math.abs(session.expiresAt.getTime() - Date.now() - INTERNAL_SESSION_TTL_MS)).toBeLessThan(5000);
    const writes = jest.spyOn(prisma.session, 'updateMany');
    try {
      const response = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200);
      expect(response.headers['set-cookie'][0]).toContain(`Max-Age=${INTERNAL_SESSION_TTL_MS / 1000}`);
      expect(response.headers['set-cookie'][0].split(';')[0]).toBe(cookie.split(';')[0]);
      expect(writes).not.toHaveBeenCalled();
      expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ expiresAt: session.expiresAt, lastActivityAt: session.lastActivityAt });
    } finally { writes.mockRestore(); }
  });
  it('renews once under concurrent activity when less than 29 days remain', async () => {
    const { cookie, session } = await loginSession();
    const before = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + INTERNAL_SESSION_TTL_MS - 2 * 24 * 60 * 60 * 1000), lastActivityAt: before } });
    await Promise.all(Array.from({ length: 3 }, () => request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200)));
    const renewed = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(Math.abs(renewed.expiresAt.getTime() - Date.now() - INTERNAL_SESSION_TTL_MS)).toBeLessThan(5000);
    expect(renewed.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
    const writes = jest.spyOn(prisma.session, 'updateMany');
    try { await auth.current(cookie.split(';')[0].split('=')[1]); expect(writes).not.toHaveBeenCalled(); } finally { writes.mockRestore(); }
  });
  it.each(['expired', 'revoked', 'inactive', 'portal'] as const)('rejects %s sessions without setting or renewing cookies', async state => {
    const { cookie, session, user } = await loginSession();
    if (state === 'inactive') await prisma.internalUser.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
    else await prisma.session.update({ where: { id: session.id }, data: state === 'expired' ? { expiresAt: new Date(Date.now() - 1000) } : state === 'revoked' ? { revokedAt: new Date() } : { kind: SessionKind.PORTAL } });
    const writes = jest.spyOn(prisma.session, 'updateMany');
    try {
      const response = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(401);
      expect(response.headers['set-cookie']).toBeUndefined(); expect(writes).not.toHaveBeenCalled();
    } finally { writes.mockRestore(); }
  });
  it.each(['revoked', 'expired', 'renewed'] as const)('rechecks the persisted session when a concurrent request has %s it', async state => {
    const { token, session } = await loginSession();
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + INTERNAL_SESSION_TTL_MS / 2) } });
    const sessionWriter: { updateMany: (...args: Parameters<typeof prisma.session.updateMany>) => Promise<{ count: number }> } = prisma.session;
    const writes = jest.spyOn(sessionWriter, 'updateMany').mockImplementationOnce(async () => {
      await prisma.session.update({ where: { id: session.id }, data: state === 'revoked' ? { revokedAt: new Date() } : { expiresAt: new Date(Date.now() + (state === 'expired' ? -1000 : INTERNAL_SESSION_TTL_MS)) } });
      return { count: 0 };
    });
    try {
      if (state === 'renewed') await expect(auth.current(token)).resolves.toHaveProperty('sessionId', session.id);
      else await expect(auth.current(token)).rejects.toThrow('Authentication required');
    } finally { writes.mockRestore(); }
  });
  it('logs out immediately and only revokes INTERNAL sessions', async () => {
    const { cookie, session, token, response } = await loginSession();
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).set('x-csrf-token', response.body.data.csrfToken).expect(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(401);
    await prisma.session.update({ where: { id: session.id }, data: { kind: SessionKind.PORTAL, revokedAt: null } });
    await auth.logout(token);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
  });
  it('preserves the current session and revokes other sessions on password change', async () => {
    const { user, cookie, response, session } = await loginSession();
    const other = await auth.login(user.email, 'ValidPass1!', 'synthetic-ip');
    await request(app.getHttpServer()).post('/api/auth/change-password').set('Cookie', cookie).set('x-csrf-token', response.body.data.csrfToken).send({ currentPassword: 'ValidPass1!', nextPassword: 'NewValid1!' }).expect(200);
    await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
    await expect(auth.current(other.token)).rejects.toThrow('Authentication required');
  });

});
