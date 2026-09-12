import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPilotConfig } from './config.mjs';
import { revalidateApprovedWorktreeContext } from './git.mjs';
import { executeTrustedCommand, ProcessExecutionError } from './internal/process-supervisor.mjs';
import { probeNodeVersion, probePnpmStorePath, probePnpmVersion } from './process.mjs';

const REQUIRED_NODE_VERSION = '24.13.0';
const REQUIRED_PNPM_VERSION = '11.4.0';
const SYNTHETIC_PRISMA_DATABASE_URL =
  'postgresql://pilot_runner:synthetic@127.0.0.1:1/pilot_generate?schema=public';

const NAMESPACE_DRIVER = join(dirname(fileURLToPath(import.meta.url)), 'internal', 'bootstrap-namespace.mjs');
const CONTAINMENT_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'internal', 'bootstrap-containment.bash');
const CACHE_MISS_PATTERN = /(?:ERR_PNPM_NO_OFFLINE|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_TARBALL_INTEGRITY|not found in (?:the )?store|missing from the store|offline mode|cache miss|could not resolve.*offline|failed to download|querying npm registry)/i;
const ENGINE_MISS_PATTERN = /(?:failed to download|download.*engine|engine.*not found|querying binaries|binaries\.prisma\.sh)/i;

export class BootstrapBlockedError extends Error {
  constructor(message, reasonCode, details = {}) {
    super(message);
    this.name = 'BootstrapBlockedError';
    this.status = 'BLOCKED';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

function within(root, candidate) {
  const path = relative(root, candidate);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function ownedRealDirectory(path, label) {
  const metadata = await lstat(path).catch(() => null);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new BootstrapBlockedError(`${label} must be a real directory`, 'UNSAFE_BOOTSTRAP_STORE');
  }
  if (metadata.uid !== process.getuid()) {
    throw new BootstrapBlockedError(`${label} must be owned by the runner user`, 'UNSAFE_BOOTSTRAP_STORE');
  }
  return realpath(path);
}

async function prepareStoreDirectories(stateRoot) {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const realStateRoot = await ownedRealDirectory(stateRoot, 'State root');
  const parent = join(realStateRoot, 'bootstrap-store');
  await mkdir(parent, { mode: 0o700 }).catch((error) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  const realParent = await ownedRealDirectory(parent, 'Bootstrap store root');
  if (!within(realStateRoot, realParent)) {
    throw new BootstrapBlockedError('Bootstrap store root escaped state authority', 'UNSAFE_BOOTSTRAP_STORE');
  }
  let runRoot;
  try {
    runRoot = await mkdtemp(join(realParent, `run-${randomUUID()}-`));
    const flatDirectories = {
      upper: 'upper',
      work: 'work',
      merged: 'merged',
      home: 'home',
      prismaUpper: 'prisma-upper',
      prismaWork: 'prisma-work',
    };
    await Promise.all(Object.values(flatDirectories).map((name) => mkdir(join(runRoot, name), { mode: 0o700 })));
    await mkdir(join(runRoot, 'home', 'cache'), { mode: 0o700 });
    await mkdir(join(runRoot, 'home', 'cache', 'prisma'), { mode: 0o700 });
    const realRunRoot = await ownedRealDirectory(runRoot, 'Bootstrap run root');
    if (!within(realParent, realRunRoot)) {
      throw new BootstrapBlockedError('Bootstrap run root escaped state authority', 'UNSAFE_BOOTSTRAP_STORE');
    }
    const directories = { runRoot: realRunRoot };
    for (const [key, name] of Object.entries(flatDirectories)) {
      directories[key] = await ownedRealDirectory(join(realRunRoot, name), `Bootstrap ${name}`);
      if (!within(realRunRoot, directories[key])) {
        throw new BootstrapBlockedError(`Bootstrap ${name} escaped run root`, 'UNSAFE_BOOTSTRAP_STORE');
      }
    }
    directories.prismaMerged = await ownedRealDirectory(join(realRunRoot, 'home', 'cache', 'prisma'), 'Bootstrap Prisma cache');
    if (!within(realRunRoot, directories.prismaMerged)) {
      throw new BootstrapBlockedError('Bootstrap Prisma cache escaped run root', 'UNSAFE_BOOTSTRAP_STORE');
    }
    return { ...directories, parent: realParent };
  } catch (error) {
    if (runRoot && within(realParent, runRoot)) {
      try {
        await rm(runRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new BootstrapBlockedError('Partial Bootstrap store cleanup failed', 'BOOTSTRAP_CLEANUP_FAILED', {
          message: cleanupError?.message,
          priorReasonCode: error?.reasonCode,
        });
      }
    }
    throw error;
  }
}

async function resolveStore() {
  let result;
  try {
    result = await probePnpmStorePath();
  } catch (error) {
    throw new BootstrapBlockedError('pnpm store could not be resolved', 'PNPM_STORE_MISSING', { message: error?.message });
  }
  if (result.code !== 0 || result.timedOut || !isAbsolute(result.stdout.trim())) {
    throw new BootstrapBlockedError('pnpm store could not be resolved', 'PNPM_STORE_MISSING');
  }
  const storePath = await realpath(result.stdout.trim()).catch(() => null);
  const requestedMetadata = await lstat(result.stdout.trim()).catch(() => null);
  const storeMetadata = storePath ? await stat(storePath).catch(() => null) : null;
  if (
    !storePath ||
    !requestedMetadata ||
    requestedMetadata.isSymbolicLink() ||
    !storeMetadata?.isDirectory() ||
    storeMetadata.uid !== process.getuid() ||
    (storeMetadata.mode & 0o022) !== 0
  ) {
    throw new BootstrapBlockedError('pnpm store is unavailable', 'PNPM_STORE_MISSING');
  }
  const indexMetadata = await lstat(join(storePath, 'index.db')).catch(() => null);
  if (!indexMetadata || indexMetadata.isSymbolicLink() || !indexMetadata.isFile() || indexMetadata.uid !== process.getuid()) {
    throw new BootstrapBlockedError('pnpm store index is unsafe', 'PNPM_STORE_MISSING');
  }
  try {
    await access(join(storePath, 'index.db'), fsConstants.R_OK);
  } catch {
    throw new BootstrapBlockedError('pnpm store index is unavailable', 'DEPENDENCY_CACHE_MISS');
  }
  return storePath;
}

async function resolvePrismaCache() {
  const requestedPath = join(userInfo().homedir, '.cache', 'prisma');
  const cachePath = await realpath(requestedPath).catch(() => null);
  const requestedMetadata = await lstat(requestedPath).catch(() => null);
  const cacheMetadata = cachePath ? await stat(cachePath).catch(() => null) : null;
  if (
    !cachePath ||
    !requestedMetadata ||
    requestedMetadata.isSymbolicLink() ||
    !cacheMetadata?.isDirectory() ||
    cacheMetadata.uid !== process.getuid() ||
    (cacheMetadata.mode & 0o022) !== 0
  ) {
    throw new BootstrapBlockedError('Prisma engine cache is unavailable', 'DEPENDENCY_CACHE_MISS');
  }
  return cachePath;
}

async function removePreparedStore(prepared) {
  const parent = await ownedRealDirectory(prepared.parent, 'Bootstrap store root');
  const runRoot = await ownedRealDirectory(prepared.runRoot, 'Bootstrap run root');
  if (!within(parent, runRoot) || !runRoot.startsWith(join(parent, 'run-'))) {
    throw new BootstrapBlockedError('Refusing unsafe Bootstrap cleanup target', 'BOOTSTRAP_CLEANUP_FAILED');
  }
  await restoreOwnedDirectoryTraversal(runRoot, runRoot);
  await rm(runRoot, { recursive: true, force: false });
}

async function restoreOwnedDirectoryTraversal(root, directory) {
  const path = relative(root, directory);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new BootstrapBlockedError('Refusing cleanup outside Bootstrap run root', 'BOOTSTRAP_CLEANUP_FAILED');
  }
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== process.getuid()) {
    throw new BootstrapBlockedError('Bootstrap cleanup encountered an unsafe directory', 'BOOTSTRAP_CLEANUP_FAILED');
  }
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await restoreOwnedDirectoryTraversal(root, join(directory, entry.name));
    }
  }
}

async function namespaceSession(mode, worktreePath, prepared, lower, prismaLower, timeoutMs) {
  const config = await loadPilotConfig();
  for (const executable of ['/usr/bin/bash', '/usr/bin/unshare', '/usr/bin/mount', '/usr/bin/setpriv']) {
    try {
      await access(executable, fsConstants.X_OK);
    } catch {
      throw new BootstrapBlockedError(`${executable} is unavailable`, 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING');
    }
  }
  const node = await realpath(process.execPath);
  const pnpm = await realpath(
    join(userInfo().homedir, '.cache', 'node', 'corepack', 'v1', 'pnpm', config.runtime.pnpm, 'bin', 'pnpm.cjs'),
  ).catch(() => null);
  if (!pnpm) throw new BootstrapBlockedError('Pinned pnpm executable is unavailable', 'TOOL_UNAVAILABLE');
  try {
    return await executeTrustedCommand(
      {
        executablePath: '/usr/bin/setpriv',
        args: [
          '--pdeathsig',
          'SIGKILL',
          '--',
          '/usr/bin/bash',
          CONTAINMENT_SCRIPT,
          'launch',
          String(process.pid),
          '/usr/bin/unshare',
          '--user',
          '--map-root-user',
          '--mount',
          '--net',
          '--pid',
          '--fork',
          '--kill-child=SIGKILL',
          '--mount-proc',
          '--',
          '/usr/bin/bash',
          CONTAINMENT_SCRIPT,
          'init',
          node,
          NAMESPACE_DRIVER,
          mode,
          worktreePath,
          lower,
          prepared.upper,
          prepared.work,
          prepared.merged,
          prismaLower,
          prepared.prismaUpper,
          prepared.prismaWork,
          prepared.prismaMerged,
          node,
          pnpm,
        ],
        fixedEnv: {
          DATABASE_URL: SYNTHETIC_PRISMA_DATABASE_URL,
          HOME: prepared.home,
          XDG_CACHE_HOME: join(prepared.home, 'cache'),
          XDG_CONFIG_HOME: join(prepared.home, 'config'),
          XDG_DATA_HOME: join(prepared.home, 'data'),
        },
      },
      { cwd: worktreePath, timeoutMs, maxOutputBytes: 8 * 1_048_576 },
    );
  } catch (error) {
    if (error instanceof ProcessExecutionError) {
      throw new BootstrapBlockedError('Bootstrap isolation process could not start', 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING', { reasonCode: error.reasonCode, message: error.message });
    }
    throw error;
  }
}

function normalizeVersion(text) {
  return text.trim().replace(/^v/, '');
}

export async function verifyRuntimeVersions() {
  if (arguments.length !== 0) {
    throw new BootstrapBlockedError('Runtime verification accepts no arguments', 'INVALID_BOOTSTRAP_ARGUMENTS');
  }
  const config = await loadPilotConfig();
  const [node, pnpm] = await Promise.all([probeNodeVersion(), probePnpmVersion()]);
  const actualNode = normalizeVersion(node.stdout);
  const actualPnpm = normalizeVersion(pnpm.stdout);
  if (node.code !== 0 || node.timedOut || actualNode !== config.runtime.node || actualNode !== REQUIRED_NODE_VERSION) {
    throw new BootstrapBlockedError('Node version does not match the pinned runtime', 'NODE_VERSION_MISMATCH', { expected: config.runtime.node, actual: actualNode });
  }
  if (pnpm.code !== 0 || pnpm.timedOut || actualPnpm !== config.runtime.pnpm || actualPnpm !== REQUIRED_PNPM_VERSION) {
    throw new BootstrapBlockedError('pnpm version does not match the pinned runtime', 'PNPM_VERSION_MISMATCH', { expected: config.runtime.pnpm, actual: actualPnpm });
  }
  return { node: actualNode, pnpm: actualPnpm };
}

function normalizedLockHash(content) {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

async function verifyVirtualStoreLock(worktreePath) {
  let workspaceContent;
  let virtualContent;
  const workspaceLock = join(worktreePath, 'pnpm-lock.yaml');
  const virtualStoreLock = join(worktreePath, 'node_modules', '.pnpm', 'lock.yaml');
  try {
    [workspaceContent, virtualContent] = await Promise.all([readFile(workspaceLock, 'utf8'), readFile(virtualStoreLock, 'utf8')]);
  } catch (error) {
    throw new BootstrapBlockedError('A required lockfile is missing after Bootstrap', 'LOCKFILE_MISSING', { missing: error?.path });
  }
  if (normalizedLockHash(workspaceContent) !== normalizedLockHash(virtualContent)) {
    throw new BootstrapBlockedError('Workspace and virtual-store lockfiles are not coherent', 'LOCKFILE_MISMATCH');
  }
  return { workspaceLock, virtualStoreLock };
}

function bootstrapFailure(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (CACHE_MISS_PATTERN.test(output) || ENGINE_MISS_PATTERN.test(output)) {
    return new BootstrapBlockedError('Bootstrap requires an artifact absent from the offline cache', 'DEPENDENCY_CACHE_MISS', {
      remediation: 'Populate the pnpm store in a separately authorized online step, then retry.',
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  if (/\[PILOT_ISOLATION\]|(?:^|\n)(?:\/usr\/bin\/)?(?:unshare|setpriv):/m.test(output)) {
    return new BootstrapBlockedError('Required namespace, mount, overlay, SQLite, or capability isolation failed', 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING', { stderr: result.stderr });
  }
  const stage = /\[PILOT_STAGE:prisma\]/.test(output) ? 'PRISMA_GENERATE_FAILED' : 'BOOTSTRAP_INSTALL_FAILED';
  return new BootstrapBlockedError('Bootstrap session failed', stage, { code: result.code, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr });
}

export async function verifyBootstrapIsolationCapability() {
  if (arguments.length !== 0) {
    throw new BootstrapBlockedError('Bootstrap capability verification accepts no arguments', 'INVALID_BOOTSTRAP_ARGUMENTS');
  }
  const config = await loadPilotConfig();
  const prepared = await prepareStoreDirectories(config.paths.stateRoot);
  let pendingError;
  try {
    const [lower, prismaLower] = await Promise.all([resolveStore(), resolvePrismaCache()]);
    const result = await namespaceSession('probe', config.repository.root, prepared, lower, prismaLower, 30_000);
    if (result.code !== 0 || result.timedOut) pendingError = bootstrapFailure(result);
  } catch (error) {
    pendingError = error;
  }
  try {
    await removePreparedStore(prepared);
  } catch (error) {
    throw new BootstrapBlockedError('Bootstrap isolation probe cleanup failed', 'BOOTSTRAP_CLEANUP_FAILED', { message: error?.message, priorReasonCode: pendingError?.reasonCode });
  }
  if (pendingError) throw pendingError;
  return { status: 'PASS', overlay: 'EPHEMERAL', lowerStore: 'READ_ONLY', mergedStore: 'WRITABLE', capabilities: 'DROPPED', network: 'DENIED' };
}

export async function bootstrapWorktree(worktreeContext) {
  if (arguments.length !== 1) {
    throw new BootstrapBlockedError('Bootstrap accepts exactly one approved worktree context', 'INVALID_WORKTREE_CONTEXT');
  }
  let context;
  try {
    context = await revalidateApprovedWorktreeContext(worktreeContext);
  } catch (error) {
    throw new BootstrapBlockedError('Bootstrap requires an approved worktree context', error?.reasonCode ?? 'INVALID_WORKTREE_CONTEXT', { message: error?.message });
  }
  const config = await loadPilotConfig();
  const versions = await verifyRuntimeVersions();
  const prepared = await prepareStoreDirectories(config.paths.stateRoot);
  let result;
  let pendingError;
  try {
    const [lower, prismaLower] = await Promise.all([resolveStore(), resolvePrismaCache()]);
    context = await revalidateApprovedWorktreeContext(context);
    result = await namespaceSession('bootstrap', context.worktreePath, prepared, lower, prismaLower, 300_000);
    if (result.code !== 0 || result.timedOut) pendingError = bootstrapFailure(result);
  } catch (error) {
    pendingError = error;
  }
  try {
    await removePreparedStore(prepared);
  } catch (error) {
    throw new BootstrapBlockedError('Bootstrap ephemeral store cleanup failed', 'BOOTSTRAP_CLEANUP_FAILED', { message: error?.message, priorReasonCode: pendingError?.reasonCode });
  }
  if (pendingError) throw pendingError;
  const locks = await verifyVirtualStoreLock(context.worktreePath);
  return {
    status: 'PASS',
    worktreePath: context.worktreePath,
    versions,
    locks,
    install: result,
    prisma: 'GENERATED',
    network: 'DENIED_BY_LINUX_NETWORK_NAMESPACE',
    store: 'EPHEMERAL_OVERLAY',
    capabilities: 'DROPPED',
  };
}
