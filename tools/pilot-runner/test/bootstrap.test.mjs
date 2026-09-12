import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  createLocalCloneFixture,
  createRepositoryFixture,
  createRunnerFixture,
  fixtureGit,
} from './helpers.mjs';

const execFileAsync = promisify(execFile);
const task = Object.freeze({ taskId: 'ATH-201', slug: 'bootstrap' });

async function setup(t, files, overrides) {
  const repository = await createRepositoryFixture(t, { files });
  const runner = await createRunnerFixture(t, repository, overrides);
  const [git, bootstrap] = await Promise.all([
    runner.importModule('lib/git.mjs'),
    runner.importModule('lib/bootstrap.mjs'),
  ]);
  return { repository, runner, git, bootstrap };
}

function workspaceFiles({ port, lowerStore, missingDependency = false } = {}) {
  const networkScript = `
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const mode = process.argv[2];
if (mode === 'lifecycle') {
  fs.mkdirSync(path.join(__dirname, 'node_modules', '.pnpm'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'pnpm-lock.yaml'), path.join(__dirname, 'node_modules', '.pnpm', 'lock.yaml'));
  let denied = false;
  try { const fd = fs.openSync(${JSON.stringify(lowerStore ?? '/missing-store')} + '/index.db', 'a'); fs.closeSync(fd); }
  catch (error) { if (['EROFS', 'EACCES', 'EPERM'].includes(error.code)) denied = true; else throw error; }
  if (!denied) process.exit(7);
  const merged = process.env.PILOT_BOOTSTRAP_STORE;
  if (!merged) process.exit(8);
  const writableProbe = path.join(merged, '.lifecycle-writable');
  fs.writeFileSync(writableProbe, 'ok\\n', { flag: 'wx' });
  fs.unlinkSync(writableProbe);
}
const markerRoot = path.join(__dirname, '.markers');
fs.mkdirSync(markerRoot, { recursive: true });
const socket = net.createConnection({ host: '127.0.0.1', port: ${port ?? 9} });
const blocked = () => { fs.writeFileSync(path.join(markerRoot, mode), 'blocked\\n'); process.exit(0); };
socket.setTimeout(750, blocked);
socket.once('error', blocked);
socket.once('connect', () => process.exit(9));
`;
  const dependency = missingDependency
    ? { 'pilot-definitely-absent-cache-package': '1.0.0' }
    : undefined;
  const rootImporter = missingDependency
    ? [
        '    dependencies:',
        '      pilot-definitely-absent-cache-package:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
      ]
    : [];
  const packageRecords = missingDependency
    ? [
        '',
        'packages:',
        '',
        '  pilot-definitely-absent-cache-package@1.0.0:',
        '    resolution: {integrity: sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}',
        '',
        'snapshots:',
        '',
        '  pilot-definitely-absent-cache-package@1.0.0: {}',
      ]
    : [];
  return {
    'package.json': `${JSON.stringify({ name: 'bootstrap-fixture', private: true, packageManager: 'pnpm@11.4.0', scripts: { preinstall: 'node network-check.cjs lifecycle' }, ...(dependency ? { dependencies: dependency } : {}) }, null, 2)}\n`,
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
    'apps/api/package.json': `${JSON.stringify({ name: '@athleta/api', private: true, scripts: { 'prisma:generate': 'node ../../network-check.cjs prisma' } }, null, 2)}\n`,
    'network-check.cjs': networkScript,
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      '',
      'settings:',
      '  autoInstallPeers: true',
      '  excludeLinksFromLockfile: false',
      '',
      'importers:',
      '',
      missingDependency ? '  .:' : '  .: {}',
      ...rootImporter,
      '',
      '  apps/api: {}',
      ...packageRecords,
      '',
    ].join('\n'),
  };
}

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
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
  });
}

async function globalStorePath() {
  const { stdout } = await execFileAsync(join(dirname(process.execPath), 'pnpm'), ['store', 'path']);
  return stdout.trim();
}

test('Bootstrap exports one indivisible operation with no cwd, selector, or direct Prisma API', async (t) => {
  const { git, bootstrap } = await setup(t, workspaceFiles());
  for (const forbidden of ['runPrismaGenerate', 'runBootstrapOperation', 'BOOTSTRAP_OPERATIONS', 'PNPM_INSTALL_ARGUMENTS', 'PRISMA_GENERATE_ARGUMENTS']) {
    assert.equal(forbidden in bootstrap, false, forbidden);
  }
  assert.equal(bootstrap.bootstrapWorktree.length, 1);
  for (const value of [
    undefined,
    { cwd: '/tmp' },
    { worktreePath: '/tmp' },
    { worktreeContext: Object.freeze({}), generatePrisma: false },
    Object.freeze({ worktreePath: '/tmp', executable: '/bin/sh', argv: ['-c', 'id'] }),
  ]) await assert.rejects(bootstrap.bootstrapWorktree(value), (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'INVALID_WORKTREE_CONTEXT');
  const primaryContext = await git.createApprovedGitContext(task);
  await assert.rejects(
    bootstrap.bootstrapWorktree(primaryContext),
    (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'INVALID_WORKTREE_CONTEXT',
  );
});

test('Bootstrap profile contains all fixed install and namespace restrictions', async (t) => {
  const { runner } = await setup(t, workspaceFiles());
  const driver = await readFile(join(runner.runnerRoot, 'lib', 'internal', 'bootstrap-namespace.mjs'), 'utf8');
  const bootstrap = await readFile(join(runner.runnerRoot, 'lib', 'bootstrap.mjs'), 'utf8');
  for (const required of ['--offline', '--frozen-lockfile', '--verify-store-integrity', '--package-import-method=copy', '--store-dir']) {
    assert.equal(driver.includes(required), true, required);
  }
  assert.equal(driver.includes('--frozen-store'), false);
  for (const required of ['--map-root-user', '--mount', '--net']) assert.equal(bootstrap.includes(required), true, required);
});

test('reports pinned runtime mismatch from fixed copied configuration', async (t) => {
  const { bootstrap } = await setup(t, workspaceFiles(), { runtime: { node: '0.0.0' } });
  await assert.rejects(bootstrap.verifyRuntimeVersions(), (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'NODE_VERSION_MISMATCH');
});

test('preflight capability proves read-only lower, writable overlay/index, dropped capabilities, and cleanup', async (t) => {
  const { repository, bootstrap } = await setup(t, workspaceFiles());
  const result = await bootstrap.verifyBootstrapIsolationCapability();
  assert.deepEqual(result, {
    status: 'PASS', overlay: 'EPHEMERAL', lowerStore: 'READ_ONLY', mergedStore: 'WRITABLE', capabilities: 'DROPPED', network: 'DENIED',
  });
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});

test('missing mount, setpriv, or overlay capability blocks without fallback', async (t) => {
  for (const [needle, replacement] of [
    ['/usr/bin/mount', '/fixture-missing/usr/bin/mount'],
    ['/usr/bin/setpriv', '/fixture-missing/usr/bin/setpriv'],
    ["'-t', 'overlay'", "'-t', 'pilot-missing-overlay'"],
  ]) {
    const fixture = await setup(t, workspaceFiles());
    const driverPath = join(fixture.runner.runnerRoot, 'lib', 'internal', 'bootstrap-namespace.mjs');
    const source = await readFile(driverPath, 'utf8');
    await writeFile(driverPath, source.replaceAll(needle, replacement), 'utf8');
    await assert.rejects(
      fixture.bootstrap.verifyBootstrapIsolationCapability(),
      (error) => error instanceof fixture.bootstrap.BootstrapBlockedError && error.reasonCode === 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING',
    );
    assert.deepEqual(await readdir(join(fixture.repository.stateRoot, 'bootstrap-store')), []);
  }
});

test('missing unshare capability blocks without fallback', async (t) => {
  const repository = await createRepositoryFixture(t, { files: workspaceFiles() });
  const runner = await createRunnerFixture(t, repository);
  const bootstrapPath = join(runner.runnerRoot, 'lib', 'bootstrap.mjs');
  const source = await readFile(bootstrapPath, 'utf8');
  await writeFile(bootstrapPath, source.replaceAll('/usr/bin/unshare', '/fixture-missing/usr/bin/unshare'), 'utf8');
  const bootstrap = await runner.importModule('lib/bootstrap.mjs');
  await assert.rejects(
    bootstrap.verifyBootstrapIsolationCapability(),
    (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING',
  );
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});

test('one real Bootstrap session runs install lifecycle and Prisma with localhost denied', async (t) => {
  let connections = 0;
  const server = createServer(() => { connections += 1; });
  t.after(() => server.close());
  const port = await listen(server);
  await proveReachable(port);
  connections = 0;
  const lowerStore = await globalStorePath();
  const { repository, git, bootstrap } = await setup(t, workspaceFiles({ port, lowerStore }));
  const gitContext = await git.createApprovedGitContext(task);
  const worktree = await git.createIsolatedWorktree(gitContext);
  const result = await bootstrap.bootstrapWorktree(worktree);
  assert.equal(result.status, 'PASS');
  assert.equal(result.prisma, 'GENERATED');
  assert.equal(result.network, 'DENIED_BY_LINUX_NETWORK_NAMESPACE');
  assert.equal(result.store, 'EPHEMERAL_OVERLAY');
  assert.equal(result.capabilities, 'DROPPED');
  assert.equal(connections, 0);
  assert.equal(await readFile(join(worktree.worktreePath, '.markers', 'lifecycle'), 'utf8'), 'blocked\n');
  assert.equal(await readFile(join(worktree.worktreePath, '.markers', 'prisma'), 'utf8'), 'blocked\n');
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
  await assert.rejects(access(join(lowerStore, '.pilot-writable')), { code: 'ENOENT' });
  assert.equal(`${result.install.stdout}\n${result.install.stderr}`.includes('ERR_SQLITE_ERROR'), false);
});

test('real offline cache miss is classified without contacting reachable host service', async (t) => {
  let connections = 0;
  const server = createServer(() => { connections += 1; });
  t.after(() => server.close());
  const port = await listen(server);
  await proveReachable(port);
  connections = 0;
  const { repository, git, bootstrap } = await setup(t, workspaceFiles({ port, lowerStore: await globalStorePath(), missingDependency: true }));
  const worktree = await git.createIsolatedWorktree(await git.createApprovedGitContext(task));
  await assert.rejects(
    bootstrap.bootstrapWorktree(worktree),
    (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'DEPENDENCY_CACHE_MISS',
  );
  assert.equal(connections, 0);
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});

test('Bootstrap revalidates worktree cleanliness immediately before mutation', async (t) => {
  const { git, bootstrap } = await setup(t, workspaceFiles());
  const worktree = await git.createIsolatedWorktree(await git.createApprovedGitContext(task));
  await writeFile(join(worktree.worktreePath, 'dirty.txt'), 'dirty\n', 'utf8');
  await assert.rejects(bootstrap.bootstrapWorktree(worktree), (error) => error.reasonCode === 'WORKTREE_NOT_CLEAN');
});

test('full Athleta Bootstrap succeeds on a local clone and leaves primary checkout unchanged', { timeout: 360_000 }, async (t) => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const repository = await createLocalCloneFixture(t, projectRoot);
  const runner = await createRunnerFixture(t, repository);
  const [git, bootstrap] = await Promise.all([runner.importModule('lib/git.mjs'), runner.importModule('lib/bootstrap.mjs')]);
  const context = await git.createApprovedGitContext({ taskId: 'ATH-299', slug: 'athleta-integration' });
  const before = await git.getCheckoutSnapshot(context);
  const worktree = await git.createIsolatedWorktree(context);
  const result = await bootstrap.bootstrapWorktree(worktree);
  assert.equal(result.status, 'PASS');
  assert.equal(result.prisma, 'GENERATED');
  assert.deepEqual(await git.getCheckoutSnapshot(context), before);
  assert.equal(await fixtureGit(worktree.worktreePath, ['branch', '--show-current']), 'athleta-pilot/ATH-299-athleta-integration');
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});
