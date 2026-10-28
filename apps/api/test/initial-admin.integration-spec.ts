import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertIsolatedTestDatabase } from '../scripts/test-database-safety';
import { initializeInitialAdministrator, inspectInitialDatabase, type InitialAdminInput } from '../scripts/initial-admin';

assertIsolatedTestDatabase();
describe('one-time initial administrator on a fresh migrated database', () => {
  let prisma: PrismaService;
  let app: INestApplication;
  let auth: AuthService;
  let input: InitialAdminInput;
  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser()); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    assertIsolatedTestDatabase();
    await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany();
    await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany();
    await prisma.person.deleteMany();
    const [target] = await prisma.$queryRaw<Array<{ database: string; cluster: string }>>`SELECT current_database() AS database, system_identifier::text AS cluster FROM pg_control_system()`;
    input = { ...target!, email: `initial-${randomUUID()}@athleta.test`, firstName: 'Initial', lastName: 'Test', password: `${randomUUID()}aA!` };
  });
  afterAll(async () => app.close());

  it('keeps only migration-defined structures and atomically creates the active GENERAL_ADMIN', async () => {
    const baseline = await inspectInitialDatabase(prisma, input);
    expect(baseline.sala_configuration).toBe(1); expect(baseline.expense_area_catalog).toBe(3);
    const created = await initializeInitialAdministrator(prisma, input);
    expect(created.status).toBe('created');
    const user = await prisma.internalUser.findUniqueOrThrow({ where: { id: created.userId }, include: { credential: true, roles: true } });
    expect(user.email).toBe(input.email); expect(user.status).toBe('ACTIVE');
    expect(user.roles.map(role => role.role)).toEqual(['GENERAL_ADMIN']);
    expect(user.credential?.mustChangePassword).toBe(true);
    expect(await argon2.verify(user.credential!.passwordHash, input.password)).toBe(true);
    expect(user.credential!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await prisma.person.count()).toBe(0); expect(await prisma.portalCredential.count()).toBe(0);
    expect(await prisma.internalUser.count()).toBe(1); expect(await prisma.internalCredential.count()).toBe(1);
  });
  it('is idempotent before and after the administrator changes the initial password', async () => {
    const created = await initializeInitialAdministrator(prisma, input);
    const initialHash = (await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } })).passwordHash;
    expect((await initializeInitialAdministrator(prisma, input)).status).toBe('already-initialized');
    expect((await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } })).passwordHash === initialHash).toBe(true);
    const login = await auth.login(input.email, input.password, '127.0.0.1');
    await auth.changePassword(login.token, input.password, `${randomUUID()}bB!`);
    await auth.logout(login.token);
    const changed = await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } });
    expect(changed.mustChangePassword).toBe(false);
    expect((await initializeInitialAdministrator(prisma, input)).status).toBe('already-initialized');
    const preserved = await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } });
    expect(preserved.passwordHash === changed.passwordHash).toBe(true); expect(preserved.mustChangePassword).toBe(false);
    expect(await prisma.internalUser.count()).toBe(1);
  });
  it('requires password change on first access and can revoke the verification session without changing it', async () => {
    await initializeInitialAdministrator(prisma, input);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: input.email, password: input.password }).expect(200);
    expect(login.body.data.mustChangePassword).toBe(true);
    const cookie = login.headers['set-cookie'][0] as string;
    const denied = await request(app.getHttpServer()).get('/api/people').set('Cookie', cookie).expect(403);
    expect(denied.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).set('x-csrf-token', login.body.data.csrfToken as string).expect(200);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    expect((await prisma.internalCredential.findFirstOrThrow()).mustChangePassword).toBe(true);
  });
  it('rejects a wrong database or cluster without creating any auth rows', async () => {
    await expect(initializeInitialAdministrator(prisma, { ...input, database: 'wrong-database' })).rejects.toThrow('INITIAL_ADMIN_TARGET_MISMATCH');
    await expect(initializeInitialAdministrator(prisma, { ...input, cluster: 'wrong-cluster' })).rejects.toThrow('INITIAL_ADMIN_TARGET_MISMATCH');
    expect(await prisma.internalUser.count()).toBe(0); expect(await prisma.internalUserRole.count()).toBe(0); expect(await prisma.internalCredential.count()).toBe(0);
  });
  it('rejects unexpected business data and preserves both it and the empty auth state', async () => {
    await prisma.person.create({ data: { firstName: 'Synthetic', lastName: 'Guard', dni: '00000001', normalizedDni: '00000001', phone: '0000000000', birthDate: new Date('1990-01-01T00:00:00Z') } });
    await expect(initializeInitialAdministrator(prisma, input)).rejects.toThrow('INITIAL_ADMIN_BUSINESS_DATA_PRESENT');
    expect(await prisma.person.count()).toBe(1); expect(await prisma.internalUser.count()).toBe(0); expect(await prisma.internalCredential.count()).toBe(0); expect(await prisma.internalUserRole.count()).toBe(0);
  });
  it('does not replace, reactivate or modify an unexpected existing account', async () => {
    const created = await initializeInitialAdministrator(prisma, input);
    await prisma.internalUser.update({ where: { id: created.userId }, data: { status: 'INACTIVE' } });
    const before = await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } });
    await expect(initializeInitialAdministrator(prisma, input)).rejects.toThrow('INITIAL_ADMIN_EXISTING_ACCOUNT_UNEXPECTED');
    expect((await prisma.internalUser.findUniqueOrThrow({ where: { id: created.userId } })).status).toBe('INACTIVE');
    expect((await prisma.internalCredential.findUniqueOrThrow({ where: { internalUserId: created.userId } })).passwordHash === before.passwordHash).toBe(true);
  });
  it('serializes simultaneous initialization without creating another administrator', async () => {
    const results = await Promise.all([initializeInitialAdministrator(prisma, input), initializeInitialAdministrator(prisma, input)]);
    expect(results.map(result => result.status).sort()).toEqual(['already-initialized', 'created']);
    expect(await prisma.internalUser.count()).toBe(1); expect(await prisma.internalUserRole.count()).toBe(1); expect(await prisma.internalCredential.count()).toBe(1);
  });
});
