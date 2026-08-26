import { Prisma, Role } from '@prisma/client';
import { AuthRateLimitService } from '../src/auth/auth-rate-limit.service';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('auth PostgreSQL persistence and constraints', () => {
  const prisma = new PrismaService();
  const users = new InternalUserService(prisma);
  const rateLimits = new AuthRateLimitService(prisma);
  const auth = new AuthService(prisma, rateLimits);

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  afterEach(async () => { await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.authAttemptBucket.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });

  async function user(email = 'persistence@athleta.test') { return users.create({ firstName: 'Synthetic', lastName: 'User', email, roles: [Role.PROFESSOR] }); }

  it('enforces credential 1:1 and persists only an Argon2id hash', async () => {
    const internalUser = await user();
    await auth.provisionCredential(internalUser.id, 'ValidPass1!');
    const credential = await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: internalUser.id } });
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
    expect(credential.passwordHash).not.toContain('ValidPass1!');
    await expect(prisma.internalCredential.create({ data: { internalUserId: internalUser.id, passwordHash: 'duplicate' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('stores only the SHA-256 session token hash and honors expiration and revocation', async () => {
    const internalUser = await user(); await auth.provisionCredential(internalUser.id, 'ValidPass1!');
    const login = await auth.login(internalUser.email, 'ValidPass1!', '198.51.100.10');
    const persisted = await prisma.session.findFirstOrThrow();
    expect(persisted.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(login.token);
    await prisma.session.update({ where: { id: persisted.id }, data: { expiresAt: new Date(0) } });
    await expect(auth.current(login.token)).rejects.toMatchObject({ status: 401 });
    await prisma.session.update({ where: { id: persisted.id }, data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } });
    await expect(auth.current(login.token)).rejects.toMatchObject({ status: 401 });
  });

  it('persists progressive lockout, recovers after expiry, and isolates identities', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await rateLimits.recordLoginFailure('one@athleta.test', '198.51.100.20');
    const account = await prisma.authAttemptBucket.findUniqueOrThrow({ where: { key: 'internal-login:email:one@athleta.test' } });
    expect(account.failureCount).toBe(5); expect(account.lockedUntil).toBeInstanceOf(Date);
    await expect(rateLimits.assertLoginAllowed('one@athleta.test', '198.51.100.20')).rejects.toMatchObject({ status: 429 });
    await expect(rateLimits.assertLoginAllowed('two@athleta.test', '198.51.100.21')).resolves.toBeUndefined();
    await prisma.authAttemptBucket.updateMany({ data: { lockedUntil: new Date(0) } });
    await expect(rateLimits.assertLoginAllowed('one@athleta.test', '198.51.100.20')).resolves.toBeUndefined();
  });

  it('enforces normalized email uniqueness, foreign keys, and bucket CHECK constraints in PostgreSQL', async () => {
    await user('unique@athleta.test');
    await expect(user('unique@athleta.test')).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.internalCredential.create({ data: { internalUserId: '00000000-0000-0000-0000-000000000000', passwordHash: 'hash' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.$executeRaw`INSERT INTO auth_attempt_buckets (key, failure_count, window_started_at, updated_at) VALUES ('invalid', -1, NOW(), NOW())`).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
