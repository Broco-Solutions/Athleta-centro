import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { assertE2ePortAvailable, assertIsolatedTestDatabase, ISOLATED_TEST_DATABASE_ENV, createIsolatedTestDatabaseMarker } from './test-database-safety';

const mode = process.argv[2];
const args = process.argv.slice(3).filter((argument, index, all) => !(argument === '--' && index === 0 && all.length > 1));
const apiDirectory = process.cwd();
if (mode !== 'integration' && mode !== 'e2e') throw new Error('Usage: run-isolated-tests.ts <integration|e2e> [test arguments]');

const activeServices: ChildProcess[] = [];
process.once('SIGINT', () => {
  process.exitCode = 130;
  for (const child of activeServices) if (child.exitCode === null) signalProcessTree(child, 'SIGTERM');
});
void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });

async function main(): Promise<void> {
  let postgres: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  const services = activeServices;
  try {
    try {
      const name = `athleta_test_${randomUUID()}`;
      postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase(name).withUsername('athleta_test').withPassword(randomUUID()).start();
    } catch (error) {
      throw new Error(`Could not start isolated PostgreSQL with Testcontainers. Ensure Docker is available; refusing to use any existing database. ${error instanceof Error ? error.message : String(error)}`);
    }
    const databaseUrl = postgres.getConnectionUri();
    const testEnv = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, SESSION_SECRET: randomUUID(), LOG_LEVEL: 'error', [ISOLATED_TEST_DATABASE_ENV]: createIsolatedTestDatabaseMarker(databaseUrl, postgres.getId()), ATHLETA_REQUIRE_ISOLATED_TEST_DATABASE: '1' };
    assertIsolatedTestDatabase(testEnv);
    const target = new URL(databaseUrl);
    process.stdout.write(`Verified isolated PostgreSQL: ${target.hostname}:${target.port}${target.pathname}\n`);
    await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: apiDirectory, env: testEnv });

    if (mode === 'integration') {
      const result = await run('pnpm', ['exec', 'jest', '--config', 'test/jest-integration.json', '--passWithNoTests', ...args], { cwd: apiDirectory, env: testEnv, allowFailure: true });
      if (result !== 0) process.exitCode = result;
    } else {
      await run('pnpm', ['run', 'prisma:seed:demo'], { cwd: apiDirectory, env: { ...testEnv, ALLOW_DUMMY_SEED: 'true' }, quiet: true });
      process.stdout.write('Synthetic fixtures initialized; credential output omitted.\n');
      await assertE2ePortAvailable(3001);
      await assertE2ePortAvailable(3000);
      // Exercise the trailing-slash configuration seen in production.
      const apiEnv = { ...testEnv, PORT: '3001', WEB_ORIGIN: 'http://localhost:3000/' };
      const webEnv = { ...testEnv, PORT: '3000', NEXT_PUBLIC_API_URL: 'http://localhost:3001' };
      services.push(spawn('pnpm', ['dev'], { cwd: apiDirectory, env: apiEnv, stdio: 'inherit', detached: true }));
      services.push(spawn('pnpm', ['dev', '--port', '3000'], { cwd: `${apiDirectory}/../web`, env: webEnv, stdio: 'inherit', detached: true }));
      await waitForHttp('http://127.0.0.1:3001/health', services);
      await waitForHttp('http://127.0.0.1:3000/login', services);
      const webDirectory = `${apiDirectory}/../web`;
      const result = await run('pnpm', ['exec', 'playwright', 'test', ...args], { cwd: webDirectory, env: testEnv, allowFailure: true });
      if (result !== 0) process.exitCode = result;
    }
  } finally {
    await stopServices(services);
    if (postgres) await postgres.stop();
  }
}

function run(command: string, commandArgs: string[], options: { cwd: string; env: NodeJS.ProcessEnv; allowFailure?: boolean; quiet?: boolean }): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: options.cwd, env: options.env, stdio: options.quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      const result = code ?? (signal === 'SIGINT' ? 130 : 1);
      if (result !== 0 && !options.allowFailure) reject(new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${result}`));
      else resolve(result);
    });
  });
}

async function waitForHttp(url: string, children: ChildProcess[]): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    for (const child of children) if (child.exitCode !== null) throw new Error('An isolated E2E service exited before becoming ready.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* service is still starting */ }
    await delay(500);
  }
  throw new Error(`Timed out waiting for isolated E2E service at ${url}.`);
}

async function stopServices(children: ChildProcess[]): Promise<void> {
  for (const child of children) if (child.exitCode === null && child.pid) signalProcessTree(child, 'SIGTERM');
  await Promise.all(children.map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => { signalProcessTree(child, 'SIGKILL'); resolve(); }, 5_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  })));
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch { child.kill(signal); }
}
