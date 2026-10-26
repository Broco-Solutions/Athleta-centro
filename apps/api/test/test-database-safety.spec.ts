import { assertIsolatedTestDatabase, createIsolatedTestDatabaseMarker, ISOLATED_TEST_DATABASE_ENV } from '../scripts/test-database-safety';

const containerId = 'a'.repeat(64);
const databaseUrl = 'postgresql://athleta_test:temporary@127.0.0.1:49152/athleta_test_123e4567-e89b-42d3-a456-426614174000?schema=public';
const marker = createIsolatedTestDatabaseMarker(databaseUrl, containerId);

describe('isolated database safety guard', () => {
  it('rejects the regular local athleta database', () => {
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://athleta:secret@localhost:5432/athleta?schema=public', [ISOLATED_TEST_DATABASE_ENV]: marker })).toThrow(/does not match a unique loopback PostgreSQL database/);
  });

  it.each(['staging', 'production'])('rejects a %s database connection', (database) => {
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', DATABASE_URL: `postgresql://user:password@db.example.com:5432/${database}`, [ISOLATED_TEST_DATABASE_ENV]: marker })).toThrow(/does not match a unique loopback PostgreSQL database/);
  });

  it('rejects a missing connection without falling back', () => {
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', [ISOLATED_TEST_DATABASE_ENV]: marker })).toThrow(/connection and isolated-runner marker are required/);
  });

  it('does not accept test mode alone or an unmarked test database', () => {
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', DATABASE_URL: databaseUrl })).toThrow(/connection and isolated-runner marker are required/);
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', [ISOLATED_TEST_DATABASE_ENV]: marker })).toThrow(/connection and isolated-runner marker are required/);
  });

  it('accepts only a matching temporary loopback URL and runner marker', () => {
    expect(() => assertIsolatedTestDatabase({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, [ISOLATED_TEST_DATABASE_ENV]: marker })).not.toThrow();
  });
});
