import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  bootstrapWorktree,
  BootstrapBlockedError,
  installFailure,
  PNPM_INSTALL_ARGUMENTS,
  PRISMA_GENERATE_ARGUMENTS,
  SYNTHETIC_PRISMA_DATABASE_URL,
  verifyRuntimeVersions,
} from '../lib/bootstrap.mjs';
import {
  approveExistingWorktree,
  createApprovedGitContext,
  createIsolatedWorktree,
} from '../lib/git.mjs';
import { runBootstrapNetworkProbe } from '../lib/process.mjs';
import { addFixtureCommit, createRepositoryFixture, fixtureGit } from './helpers.mjs';

const BRANCH = 'athleta-pilot/ATH-201-bootstrap';

async function contextFor(fixture, overrides = {}) {
  return createApprovedGitContext({
    approvedRepositoryRoot: fixture.repoPath,
    repositoryPath: fixture.repoPath,
    worktreeRoot: fixture.worktreeRoot,
    approvedBaseSha: fixture.baseSha,
    branchName: BRANCH,
    ...overrides,
  });
}

test('reports pinned runtime mismatch from inside the network-denied profile', async () => {
  await assert.rejects(
    verifyRuntimeVersions({ nodeVersion: '0.0.0' }),
    (error) =>
      error instanceof BootstrapBlockedError && error.reasonCode === 'NODE_VERSION_MISMATCH',
  );
});

test('classifies offline cache misses without any online retry contract', () => {
  const error = installFailure({
    code: 1,
    timedOut: false,
    stdout: '',
    stderr: 'ERR_PNPM_NO_OFFLINE_META package missing in offline mode',
  });
  assert.equal(error.reasonCode, 'DEPENDENCY_CACHE_MISS');
  assert.deepEqual(PNPM_INSTALL_ARGUMENTS, [
    'install',
    '--offline',
    '--frozen-lockfile',
    '--verify-store-integrity',
  ]);
  assert.deepEqual(PRISMA_GENERATE_ARGUMENTS, [
    '--filter',
    '@athleta/api',
    'prisma:generate',
  ]);
  assert.match(SYNTHETIC_PRISMA_DATABASE_URL, /^postgresql:\/\/pilot_runner:synthetic@/);
});

test('Bootstrap public API rejects the primary checkout, arbitrary paths, and forged contexts', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const gitContext = await contextFor(fixture);
  await assert.rejects(
    approveExistingWorktree({
      gitContext,
      worktreePath: fixture.repoPath,
      branchName: BRANCH,
      baseSha: fixture.baseSha,
    }),
    (error) => error.reasonCode === 'PRIMARY_CHECKOUT_FORBIDDEN',
  );
  await assert.rejects(
    bootstrapWorktree({ worktreePath: fixture.repoPath, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'INVALID_WORKTREE_CONTEXT',
  );
  await assert.rejects(
    bootstrapWorktree({
      worktreeContext: Object.freeze({
        repositoryRoot: fixture.repoPath,
        worktreeRoot: fixture.worktreeRoot,
        worktreePath: fixture.outsideRoot,
        branchName: BRANCH,
        approvedBaseSha: fixture.baseSha,
      }),
      generatePrisma: false,
    }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'INVALID_WORKTREE_CONTEXT',
  );
});

test('Bootstrap revalidates registration, branch, base, origin, and cleanliness', async (t) => {
  const unregisteredFixture = await createRepositoryFixture(t);
  const unregisteredGit = await contextFor(unregisteredFixture);
  const unregisteredPath = join(unregisteredFixture.worktreeRoot, 'unregistered');
  const unregisteredContext = await createIsolatedWorktree({
    context: unregisteredGit,
    targetPath: unregisteredPath,
  });
  await fixtureGit(unregisteredFixture.repoPath, ['worktree', 'remove', '--force', unregisteredPath]);
  await mkdir(unregisteredPath);
  await assert.rejects(
    bootstrapWorktree({ worktreeContext: unregisteredContext, generatePrisma: false }),
    (error) =>
      error instanceof BootstrapBlockedError && error.reasonCode === 'WORKTREE_NOT_REGISTERED',
  );

  const branchFixture = await createRepositoryFixture(t);
  const branchGit = await contextFor(branchFixture);
  const branchContext = await createIsolatedWorktree({
    context: branchGit,
    targetPath: join(branchFixture.worktreeRoot, 'wrong-branch'),
  });
  await fixtureGit(branchContext.worktreePath, [
    'switch',
    '-c',
    'athleta-pilot/ATH-999-wrong',
  ]);
  await assert.rejects(
    bootstrapWorktree({ worktreeContext: branchContext, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'BRANCH_MISMATCH',
  );

  const baseFixture = await createRepositoryFixture(t);
  const baseGit = await contextFor(baseFixture);
  const baseContext = await createIsolatedWorktree({
    context: baseGit,
    targetPath: join(baseFixture.worktreeRoot, 'wrong-base'),
  });
  await addFixtureCommit(baseContext.worktreePath, 'AFTER-BASE.md');
  await assert.rejects(
    bootstrapWorktree({ worktreeContext: baseContext, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'UNAPPROVED_BASE_SHA',
  );

  const originFixture = await createRepositoryFixture(t);
  const originGit = await contextFor(originFixture);
  const originContext = await createIsolatedWorktree({
    context: originGit,
    targetPath: join(originFixture.worktreeRoot, 'wrong-origin'),
  });
  await fixtureGit(originContext.worktreePath, [
    'remote',
    'set-url',
    'origin',
    'https://github.com/example/not-athleta.git',
  ]);
  await assert.rejects(
    bootstrapWorktree({ worktreeContext: originContext, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'REMOTE_MISMATCH',
  );

  const dirtyFixture = await createRepositoryFixture(t);
  const dirtyGit = await contextFor(dirtyFixture);
  const dirtyContext = await createIsolatedWorktree({
    context: dirtyGit,
    targetPath: join(dirtyFixture.worktreeRoot, 'dirty'),
  });
  await writeFile(join(dirtyContext.worktreePath, 'unexpected.txt'), 'unsafe condition\n', 'utf8');
  await assert.rejects(
    bootstrapWorktree({ worktreeContext: dirtyContext, generatePrisma: false }),
    (error) => error instanceof BootstrapBlockedError && error.reasonCode === 'WORKTREE_NOT_CLEAN',
  );
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function proveReachable(port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', reject);
  });
}

test('Bootstrap network namespace denies a connection to a reachable host service', async (t) => {
  let isolatedConnections = 0;
  const server = createServer(() => {
    isolatedConnections += 1;
  });
  t.after(() => server.close());
  const port = await listen(server);
  await proveReachable(port);
  isolatedConnections = 0;
  const result = await runBootstrapNetworkProbe({ port });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.timedOut, false);
  assert.equal(isolatedConnections, 0);
});

test('real Bootstrap runs lifecycle scripts offline inside the denied network namespace', async (t) => {
  let connections = 0;
  const server = createServer(() => {
    connections += 1;
  });
  t.after(() => server.close());
  const port = await listen(server);
  const networkCheck = `
const net = require('node:net');
const fs = require('node:fs');
fs.mkdirSync('node_modules/.pnpm', { recursive: true });
fs.copyFileSync('pnpm-lock.yaml', 'node_modules/.pnpm/lock.yaml');
const socket = net.createConnection({ host: '127.0.0.1', port: ${port} });
const denied = () => process.exit(0);
socket.setTimeout(1000, denied);
socket.once('error', denied);
socket.once('connect', () => process.exit(9));
`;
  const fixture = await createRepositoryFixture(t, {
    files: {
      'package.json': `${JSON.stringify({
        name: 'bootstrap-network-fixture',
        private: true,
        packageManager: 'pnpm@11.4.0',
        scripts: { preinstall: 'node network-check.cjs' },
      }, null, 2)}\n`,
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        '',
        'settings:',
        '  autoInstallPeers: true',
        '  excludeLinksFromLockfile: false',
        '',
        'importers:',
        '  .: {}',
        '',
      ].join('\n'),
      'network-check.cjs': networkCheck,
    },
  });
  const gitContext = await contextFor(fixture);
  const worktreeContext = await createIsolatedWorktree({
    context: gitContext,
    targetPath: join(fixture.worktreeRoot, 'bootstrap-real'),
  });
  const result = await bootstrapWorktree({ worktreeContext, generatePrisma: false });
  assert.equal(result.status, 'PASS');
  assert.equal(result.network, 'DENIED_BY_LINUX_NETWORK_NAMESPACE');
  assert.equal(result.worktreePath, worktreeContext.worktreePath);
  assert.equal(connections, 0);
});
