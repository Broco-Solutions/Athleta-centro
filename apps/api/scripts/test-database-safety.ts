import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

export const ISOLATED_TEST_DATABASE_ENV = 'ATHLETA_ISOLATED_TEST_DATABASE';

export interface IsolatedTestDatabaseMarker {
  readonly database: string;
  readonly hostname: string;
  readonly port: number;
  readonly nonce: string;
  readonly containerId: string;
}

export function createIsolatedTestDatabaseMarker(connectionString: string, containerId: string): string {
  const url = parsePostgresUrl(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^athleta_test_[0-9a-f-]{36}$/i.test(database) || !/^[0-9a-f]{64}$/i.test(containerId)) {
    throw new Error('Isolated test database must have a unique athleta_test_<UUID> name.');
  }
  return JSON.stringify({ database, hostname: url.hostname, port: Number(url.port), nonce: randomUUID(), containerId } satisfies IsolatedTestDatabaseMarker);
}

export function assertIsolatedTestDatabase(env: NodeJS.ProcessEnv = process.env): void {
  const markerValue = env[ISOLATED_TEST_DATABASE_ENV];
  const connectionString = env.DATABASE_URL;
  if (!markerValue || !connectionString) {
    throw new Error('Refusing database tests: a PostgreSQL Testcontainers connection and isolated-runner marker are required. Run `pnpm test:integration` or `pnpm test:e2e`.');
  }

  let marker: IsolatedTestDatabaseMarker;
  try {
    marker = JSON.parse(markerValue) as IsolatedTestDatabaseMarker;
  } catch {
    throw new Error('Refusing database tests: isolated-runner marker is invalid.');
  }
  const url = parsePostgresUrl(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  const port = Number(url.port);
  if (!marker.nonce || !/^[0-9a-f-]{36}$/i.test(marker.nonce) || !/^[0-9a-f]{64}$/i.test(marker.containerId)
    || marker.database !== database || marker.hostname !== url.hostname || marker.port !== port
    || !/^athleta_test_[0-9a-f-]{36}$/i.test(database)
    || database.toLowerCase() === 'athleta'
    || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    || port < 1 || port > 65535) {
    throw new Error('Refusing database tests: DATABASE_URL does not match a unique loopback PostgreSQL database supplied by the isolated test runner.');
  }
  if (env.NODE_ENV !== 'test') {
    throw new Error('Refusing database tests: NODE_ENV must be test.');
  }
}

export function assertIntegrationTestInvocation(argv: readonly string[]): void {
  const isIntegrationInvocation = argv.some((argument) => argument.includes('jest-integration.json') || argument.includes('.integration-spec.ts'));
  if (isIntegrationInvocation || process.env.ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE === '1') {
    assertIsolatedTestDatabase();
  } else if (process.env.DATABASE_URL && !process.env[ISOLATED_TEST_DATABASE_ENV]) {
    throw new Error('Refusing to run tests with DATABASE_URL unless it was provided by the isolated test runner.');
  }
}

export async function assertE2ePortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop development servers before running isolated E2E tests; existing servers are never reused.`)));
    server.listen(port, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function parsePostgresUrl(connectionString: string): URL {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Refusing database tests: DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Refusing database tests: only PostgreSQL connections are allowed.');
  }
  return url;
}
