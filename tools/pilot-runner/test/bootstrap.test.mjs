import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { access, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

function workspaceFiles({ port, lowerStore, missingDependency = false, processTreeMode } = {}) {
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
  const detachedTreeScript = String.raw`
const { spawn } = require('node:child_process');
const { mkdirSync, readlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const [role, mode] = process.argv.slice(2);
const markerRoot = path.join(__dirname, '.process-tree');
mkdirSync(markerRoot, { recursive: true });

function record(name) {
  const namespaces = Object.fromEntries(['pid', 'mnt', 'net'].map((kind) => [kind, readlinkSync('/proc/self/ns/' + kind)]));
  writeFileSync(path.join(markerRoot, name + '.json'), JSON.stringify({ pid: process.pid, ppid: process.ppid, namespaces }) + '\n');
}

function stayActive(name) {
  const marker = path.join(markerRoot, name + '.activity');
  const pulse = () => writeFileSync(marker, String(Date.now()) + '\n');
  pulse();
  setInterval(pulse, 25);
}

async function waitFor(name) {
  const target = path.join(markerRoot, name + '.json');
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try { require('node:fs').accessSync(target); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  process.exit(96);
}

async function main() {
  record(role);
  if (role === 'root') {
    const child = spawn(process.execPath, [__filename, 'middle', mode], { detached: true, stdio: 'ignore' });
    child.unref();
    await waitFor('great');
    stayActive(role);
    require('node:fs').mkdirSync(path.join(__dirname, 'node_modules', '.pnpm'), { recursive: true });
    require('node:fs').copyFileSync(path.join(__dirname, 'pnpm-lock.yaml'), path.join(__dirname, 'node_modules', '.pnpm', 'lock.yaml'));
    if (mode === 'normal') process.exit(0);
    if (mode === 'error') process.exit(17);
  } else if (role === 'middle') {
    const child = spawn(process.execPath, [__filename, 'leaf', mode], { detached: true, stdio: 'ignore' });
    child.unref();
    stayActive(role);
  } else if (role === 'leaf') {
    const child = spawn(process.execPath, [__filename, 'great', mode], { detached: true, stdio: 'ignore' });
    child.unref();
    stayActive(role);
  } else if (role === 'great') {
    stayActive(role);
  } else {
    process.exit(97);
  }
}

main().catch(() => process.exit(98));
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
    'package.json': `${JSON.stringify({ name: 'bootstrap-fixture', private: true, packageManager: 'pnpm@11.4.0', scripts: { preinstall: processTreeMode ? `node detached-tree.cjs root ${processTreeMode}` : 'node network-check.cjs lifecycle' }, ...(dependency ? { dependencies: dependency } : {}) }, null, 2)}\n`,
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
    'apps/api/package.json': `${JSON.stringify({ name: '@athleta/api', private: true, scripts: { 'prisma:generate': 'node ../../network-check.cjs prisma' } }, null, 2)}\n`,
    'network-check.cjs': networkScript,
    ...(processTreeMode ? { 'detached-tree.cjs': detachedTreeScript } : {}),
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

async function namespaceHolders(kind, namespace) {
  const holders = [];
  for (const entry of await readdir('/proc', { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      if (await readlink(`/proc/${entry.name}/ns/${kind}`) === namespace) holders.push(Number(entry.name));
    } catch {}
  }
  return holders;
}

async function readDetachedTree(worktreePath) {
  const root = join(worktreePath, '.process-tree');
  const roles = ['root', 'middle', 'leaf', 'great'];
  const records = await Promise.all(roles.map(async (role) => JSON.parse(await readFile(join(root, `${role}.json`), 'utf8'))));
  return { root, roles, records };
}

async function assertDetachedTreeStopped(worktreePath) {
  const tree = await readDetachedTree(worktreePath);
  assert.equal(new Set(tree.records.map((record) => record.pid)).size, tree.roles.length, 'detached tree reused a namespace-local PID');
  for (const kind of ['pid', 'mnt', 'net']) {
    const identifiers = new Set(tree.records.map((record) => record.namespaces[kind]));
    assert.equal(identifiers.size, 1, `${kind} namespace diverged inside detached tree`);
    const [identifier] = identifiers;
    const deadline = Date.now() + 2_000;
    let holders;
    do {
      holders = await namespaceHolders(kind, identifier);
      if (holders.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.deepEqual(holders, [], `${kind} namespace still has holders`);
  }
  const before = await Promise.all(tree.roles.map((role) => readFile(join(tree.root, `${role}.activity`), 'utf8')));
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  const after = await Promise.all(tree.roles.map((role) => readFile(join(tree.root, `${role}.activity`), 'utf8')));
  assert.deepEqual(after, before, 'detached tree continued writing after Bootstrap returned');
}

async function waitForFiles(paths, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const available = await Promise.all(paths.map((path) => access(path).then(() => true, () => false)));
    if (available.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${paths.join(', ')}`);
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
  const containment = await readFile(join(runner.runnerRoot, 'lib', 'internal', 'bootstrap-containment.bash'), 'utf8');
  for (const required of ['--offline', '--frozen-lockfile', '--verify-store-integrity', '--package-import-method=copy', '--store-dir']) {
    assert.equal(driver.includes(required), true, required);
  }
  assert.equal(driver.includes('--frozen-store'), false);
  for (const required of ['--pdeathsig', '--map-root-user', '--mount', '--net', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc']) {
    assert.equal(bootstrap.includes(required), true, required);
  }
  for (const required of ['BASHPID == 1', 'PPID == expected_parent', 'wait -n -p', 'trap forward_term TERM']) {
    assert.equal(containment.includes(required), true, required);
  }
  assert.equal(containment.includes('eval'), false);
});

test('PID 1 init reaps adopted orphans and preserves zero and non-zero driver status', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-containment-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runnerRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const containment = join(runnerRoot, 'lib', 'internal', 'bootstrap-containment.bash');
  const driver = join(runnerRoot, 'test', 'fixtures', 'containment-init-driver.cjs');

  for (const expectedCode of [0, 23]) {
    const args = [
      '--user', '--map-root-user', '--mount', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '--',
      '/usr/bin/bash', containment, 'init', process.execPath, driver, 'reaper', root, String(expectedCode),
      ...Array.from({ length: 9 }, (_, index) => `padding-${index}`),
    ];
    let actualCode = 0;
    try {
      await execFileAsync('/usr/bin/unshare', args);
    } catch (error) {
      actualCode = error.code;
    }
    assert.equal(actualCode, expectedCode);
    const result = JSON.parse(await readFile(join(root, `result-${expectedCode}.json`), 'utf8'));
    assert.equal(result.driverPid, 2);
    assert.equal(result.driverParentPid, 1);
    assert.equal(result.procSelf, '/proc/2');
    assert.equal(result.orphanReaped, true);
  }
});

test('containment guard and init fail closed outside their required parent/PID namespace', async () => {
  const containment = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'internal', 'bootstrap-containment.bash');
  await assert.rejects(
    execFileAsync('/usr/bin/bash', [containment, 'launch', '1', '/usr/bin/unshare', '--version']),
    (error) => error.code === 70 && /supervisor exited/.test(error.stderr),
  );
  await assert.rejects(
    execFileAsync('/usr/bin/bash', [
      containment, 'init', process.execPath, '/fixture/driver', ...Array.from({ length: 12 }, () => 'argument'),
    ]),
    (error) => error.code === 70 && /not PID 1/.test(error.stderr),
  );
});

test('supervisor crash triggers pdeathsig and empties the PID namespace', { timeout: 10_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-containment-crash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runnerRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const containment = join(runnerRoot, 'lib', 'internal', 'bootstrap-containment.bash');
  const crashParent = join(runnerRoot, 'test', 'fixtures', 'containment-crash-parent.mjs');
  const driver = join(runnerRoot, 'test', 'fixtures', 'containment-hold-driver.cjs');
  const parent = spawn(process.execPath, [crashParent, containment, driver, root], {
    shell: false,
    stdio: 'ignore',
  });
  t.after(() => { try { parent.kill('SIGKILL'); } catch {} });

  const recordPaths = ['root', 'child'].map((role) => join(root, `${role}.json`));
  const activityPaths = ['root', 'child'].map((role) => join(root, `${role}.activity`));
  await waitForFiles([...recordPaths, ...activityPaths]);
  const records = await Promise.all(recordPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  for (const kind of ['pid', 'mnt']) {
    assert.equal(new Set(records.map((record) => record.namespaces[kind])).size, 1);
    assert.ok((await namespaceHolders(kind, records[0].namespaces[kind])).length >= 2);
  }

  parent.kill('SIGKILL');
  await new Promise((resolve) => parent.once('close', resolve));
  const deadline = Date.now() + 2_000;
  for (const kind of ['pid', 'mnt']) {
    let holders;
    do {
      holders = await namespaceHolders(kind, records[0].namespaces[kind]);
      if (holders.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.deepEqual(holders, [], `${kind} namespace survived supervisor death`);
  }

  const before = await Promise.all(activityPaths.map((path) => readFile(path, 'utf8')));
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  const after = await Promise.all(activityPaths.map((path) => readFile(path, 'utf8')));
  assert.deepEqual(after, before, 'contained processes continued after supervisor death');
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

test('missing Bash, pdeathsig, PID namespace, or private proc blocks without fallback', async (t) => {
  for (const [needle, replacement] of [
    ['/usr/bin/bash', '/fixture-missing/usr/bin/bash'],
    ["          '--pdeathsig',\n", "          '--pilot-missing-pdeathsig',\n"],
    ["          '--pid',\n", ''],
    ["          '--mount-proc',\n", ''],
  ]) {
    const repository = await createRepositoryFixture(t, { files: workspaceFiles() });
    const runner = await createRunnerFixture(t, repository);
    const bootstrapPath = join(runner.runnerRoot, 'lib', 'bootstrap.mjs');
    const source = await readFile(bootstrapPath, 'utf8');
    const changed = source.replaceAll(needle, replacement);
    assert.notEqual(changed, source, `fixture replacement missing: ${needle}`);
    await writeFile(bootstrapPath, changed, 'utf8');
    const bootstrap = await runner.importModule('lib/bootstrap.mjs');
    let caught;
    try {
      await bootstrap.verifyBootstrapIsolationCapability();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof bootstrap.BootstrapBlockedError, needle);
    assert.equal(caught.reasonCode, 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING', `${needle}: ${JSON.stringify(caught.details)}`);
    assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
  }
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

test('normal Bootstrap completion kills a four-level detached process tree', { timeout: 20_000 }, async (t) => {
  const { repository, git, bootstrap } = await setup(t, workspaceFiles({ processTreeMode: 'normal' }));
  const worktree = await git.createIsolatedWorktree(await git.createApprovedGitContext(task));
  const result = await bootstrap.bootstrapWorktree(worktree);
  assert.equal(result.status, 'PASS');
  await assertDetachedTreeStopped(worktree.worktreePath);
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});

test('Bootstrap install failure kills a four-level detached process tree', { timeout: 20_000 }, async (t) => {
  const { repository, git, bootstrap } = await setup(t, workspaceFiles({ processTreeMode: 'error' }));
  const worktree = await git.createIsolatedWorktree(await git.createApprovedGitContext(task));
  await assert.rejects(
    bootstrap.bootstrapWorktree(worktree),
    (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'BOOTSTRAP_INSTALL_FAILED',
  );
  await assertDetachedTreeStopped(worktree.worktreePath);
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
});

test('Bootstrap timeout kills detached sessions outside the original process group', { timeout: 20_000 }, async (t) => {
  const repository = await createRepositoryFixture(t, { files: workspaceFiles({ processTreeMode: 'timeout' }) });
  const runner = await createRunnerFixture(t, repository);
  const bootstrapPath = join(runner.runnerRoot, 'lib', 'bootstrap.mjs');
  const source = await readFile(bootstrapPath, 'utf8');
  const shortened = source.replace(
    "namespaceSession('bootstrap', context.worktreePath, prepared, lower, prismaLower, 300_000)",
    "namespaceSession('bootstrap', context.worktreePath, prepared, lower, prismaLower, 1_500)",
  );
  assert.notEqual(shortened, source, 'test fixture could not shorten the internal Bootstrap timeout');
  await writeFile(bootstrapPath, shortened, 'utf8');
  const [git, bootstrap] = await Promise.all([runner.importModule('lib/git.mjs'), runner.importModule('lib/bootstrap.mjs')]);
  const worktree = await git.createIsolatedWorktree(await git.createApprovedGitContext(task));
  await assert.rejects(
    bootstrap.bootstrapWorktree(worktree),
    (error) => error instanceof bootstrap.BootstrapBlockedError && error.reasonCode === 'BOOTSTRAP_INSTALL_FAILED' && error.details.timedOut === true,
  );
  await assertDetachedTreeStopped(worktree.worktreePath);
  assert.deepEqual(await readdir(join(repository.stateRoot, 'bootstrap-store')), []);
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
