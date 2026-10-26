import { spawnSync } from 'node:child_process';
import { ISOLATED_TEST_DATABASE_ENV } from '../scripts/test-database-safety';

describe('E2E fixture entry points', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMarker = process.env[ISOLATED_TEST_DATABASE_ENV];
  const originalRequiredFlag = process.env.ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env[ISOLATED_TEST_DATABASE_ENV];
    delete process.env.ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE;
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalMarker === undefined) delete process.env[ISOLATED_TEST_DATABASE_ENV];
    else process.env[ISOLATED_TEST_DATABASE_ENV] = originalMarker;
    if (originalRequiredFlag === undefined) delete process.env.ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE;
    else process.env.ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE = originalRequiredFlag;
  });

  it.each(['scripts/e2e-fixture.ts', 'scripts/health-declaration-e2e-fixture.ts'])('refuses to initialize Prisma in %s without the isolated runner', (entryPoint) => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
    delete env.DATABASE_URL;
    delete env[ISOLATED_TEST_DATABASE_ENV];
    const result = spawnSync('pnpm', ['exec', 'tsx', entryPoint], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('connection and isolated-runner marker are required');
  });
});
