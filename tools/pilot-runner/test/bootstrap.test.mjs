import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bootstrapWorktree,
  BootstrapBlockedError,
  PNPM_INSTALL_ARGUMENTS,
  PRISMA_GENERATE_ARGUMENTS,
  runPrismaGenerate,
  SYNTHETIC_PRISMA_DATABASE_URL,
  verifyRuntimeVersions,
} from '../lib/bootstrap.mjs';

function commandResult({ code = 0, stdout = '', stderr = '', timedOut = false } = {}) {
  return { code, stdout, stderr, timedOut, signal: null };
}

test('blocks an incorrect Node version', async () => {
  const fakeRunner = async (executable) =>
    commandResult({ stdout: executable === 'node' ? 'v22.0.0\n' : '11.4.0\n' });
  await assert.rejects(
    verifyRuntimeVersions({ processRunner: fakeRunner }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'NODE_VERSION_MISMATCH',
  );
});

test('reports an offline pnpm cache miss without retrying online', async (t) => {
  const worktreePath = await mkdtemp(join(tmpdir(), 'athleta-bootstrap-'));
  t.after(() => rm(worktreePath, { recursive: true, force: true }));
  const calls = [];
  const fakeRunner = async (executable, args, options) => {
    calls.push({ executable, args, options });
    if (args[0] === '--version') {
      return commandResult({ stdout: executable === 'node' ? 'v24.13.0\n' : '11.4.0\n' });
    }
    return commandResult({ code: 1, stderr: 'ERR_PNPM_NO_OFFLINE_META package missing in offline mode' });
  };
  await assert.rejects(
    bootstrapWorktree({ worktreePath, processRunner: fakeRunner, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'DEPENDENCY_CACHE_MISS',
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].args, [...PNPM_INSTALL_ARGUMENTS]);
  assert.equal(calls.flatMap((call) => call.args).includes('--offline'), true);
  assert.equal(calls.some((call) => call.args.includes('fetch')), false);
});

test('uses only offline frozen install flags and verifies both lockfiles', async (t) => {
  const worktreePath = await mkdtemp(join(tmpdir(), 'athleta-bootstrap-'));
  t.after(() => rm(worktreePath, { recursive: true, force: true }));
  await mkdir(join(worktreePath, 'node_modules', '.pnpm'), { recursive: true });
  const lock = 'lockfileVersion: 9.0\n';
  await writeFile(join(worktreePath, 'pnpm-lock.yaml'), lock, 'utf8');
  await writeFile(join(worktreePath, 'node_modules', '.pnpm', 'lock.yaml'), lock, 'utf8');
  const calls = [];
  const fakeRunner = async (executable, args, options) => {
    calls.push({ executable, args, options });
    if (args[0] === '--version') {
      return commandResult({ stdout: executable === 'node' ? 'v24.13.0\n' : '11.4.0\n' });
    }
    return commandResult();
  };
  const result = await bootstrapWorktree({
    worktreePath,
    processRunner: fakeRunner,
    generatePrisma: false,
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(calls[2].args, [
    'install',
    '--offline',
    '--frozen-lockfile',
    '--verify-store-integrity',
  ]);
  assert.equal(calls[2].args.includes('--force'), false);
  assert.equal(calls[2].args.includes('--fix-lockfile'), false);
  assert.equal(calls[2].args.includes('--no-frozen-lockfile'), false);
  assert.equal(calls[2].args.includes('--ignore-scripts'), false);
});

test('runs Prisma generate with a synthetic URL and no migration command', async () => {
  const calls = [];
  const fakeRunner = async (executable, args, options) => {
    calls.push({ executable, args, options });
    return commandResult();
  };
  await runPrismaGenerate({ worktreePath: '/synthetic/worktree', processRunner: fakeRunner });
  assert.deepEqual(calls[0].args, [...PRISMA_GENERATE_ARGUMENTS]);
  assert.equal(calls[0].options.env.DATABASE_URL, SYNTHETIC_PRISMA_DATABASE_URL);
  assert.equal(calls[0].args.some((arg) => /migrat/i.test(arg)), false);
});
