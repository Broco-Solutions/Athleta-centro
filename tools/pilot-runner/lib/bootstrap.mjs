import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_ENV_ALLOWLIST, runProcess } from './process.mjs';

export const REQUIRED_NODE_VERSION = '24.13.0';
export const REQUIRED_PNPM_VERSION = '11.4.0';
export const PNPM_INSTALL_ARGUMENTS = Object.freeze([
  'install',
  '--offline',
  '--frozen-lockfile',
  '--verify-store-integrity',
]);
export const PRISMA_GENERATE_ARGUMENTS = Object.freeze([
  '--filter',
  '@athleta/api',
  'prisma:generate',
]);
export const SYNTHETIC_PRISMA_DATABASE_URL =
  'postgresql://pilot_runner:synthetic@127.0.0.1:1/pilot_generate?schema=public';

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

function normalizeVersion(text) {
  return text.trim().replace(/^v/, '');
}

async function runCheckedVersion(executable, processRunner) {
  const result = await processRunner(executable, ['--version'], { timeoutMs: 10_000 });
  if (result.timedOut || result.code !== 0) {
    throw new BootstrapBlockedError(`${executable} is unavailable`, 'TOOL_UNAVAILABLE', {
      executable,
      stderr: result.stderr,
    });
  }
  return normalizeVersion(result.stdout);
}

export async function verifyRuntimeVersions({
  nodeExecutable = 'node',
  pnpmExecutable = 'pnpm',
  nodeVersion = REQUIRED_NODE_VERSION,
  pnpmVersion = REQUIRED_PNPM_VERSION,
  processRunner = runProcess,
} = {}) {
  const [actualNode, actualPnpm] = await Promise.all([
    runCheckedVersion(nodeExecutable, processRunner),
    runCheckedVersion(pnpmExecutable, processRunner),
  ]);
  if (actualNode !== nodeVersion) {
    throw new BootstrapBlockedError('Node version does not match the pinned runtime', 'NODE_VERSION_MISMATCH', {
      expected: nodeVersion,
      actual: actualNode,
    });
  }
  if (actualPnpm !== pnpmVersion) {
    throw new BootstrapBlockedError('pnpm version does not match the pinned runtime', 'PNPM_VERSION_MISMATCH', {
      expected: pnpmVersion,
      actual: actualPnpm,
    });
  }
  return { node: actualNode, pnpm: actualPnpm };
}

function installFailure(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (CACHE_MISS_PATTERN.test(output)) {
    return new BootstrapBlockedError(
      'The offline pnpm store does not contain all required dependencies',
      'DEPENDENCY_CACHE_MISS',
      { remediation: 'Populate the pnpm store in a separately authorized online step, then retry.' },
    );
  }
  return new BootstrapBlockedError('Offline dependency installation failed', 'BOOTSTRAP_INSTALL_FAILED', {
    code: result.code,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function normalizedLockHash(content) {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

export async function verifyVirtualStoreLock(worktreePath) {
  const workspaceLock = join(worktreePath, 'pnpm-lock.yaml');
  const virtualStoreLock = join(worktreePath, 'node_modules', '.pnpm', 'lock.yaml');
  let workspaceContent;
  let virtualContent;
  try {
    [workspaceContent, virtualContent] = await Promise.all([
      readFile(workspaceLock, 'utf8'),
      readFile(virtualStoreLock, 'utf8'),
    ]);
  } catch (error) {
    throw new BootstrapBlockedError('A required lockfile is missing after bootstrap', 'LOCKFILE_MISSING', {
      missing: error?.path,
    });
  }
  if (normalizedLockHash(workspaceContent) !== normalizedLockHash(virtualContent)) {
    throw new BootstrapBlockedError(
      'Workspace and virtual-store lockfiles are not coherent',
      'LOCKFILE_MISMATCH',
    );
  }
  return { workspaceLock, virtualStoreLock };
}

export async function runPrismaGenerate({
  worktreePath,
  pnpmExecutable = 'pnpm',
  processRunner = runProcess,
} = {}) {
  const result = await processRunner(pnpmExecutable, [...PRISMA_GENERATE_ARGUMENTS], {
    cwd: worktreePath,
    timeoutMs: 120_000,
    allowedEnv: [...DEFAULT_ENV_ALLOWLIST, 'DATABASE_URL'],
    env: { DATABASE_URL: SYNTHETIC_PRISMA_DATABASE_URL },
  });
  if (result.timedOut || result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`;
    if (CACHE_MISS_PATTERN.test(output) || ENGINE_MISS_PATTERN.test(output)) {
      throw new BootstrapBlockedError(
        'Prisma generate requires an artifact absent from the offline cache',
        'DEPENDENCY_CACHE_MISS',
        { remediation: 'Populate the required Prisma artifacts in an authorized online step, then retry.' },
      );
    }
    throw new BootstrapBlockedError('Prisma client generation failed', 'PRISMA_GENERATE_FAILED', {
      code: result.code,
      timedOut: result.timedOut,
      stderr: result.stderr,
    });
  }
  return result;
}

export async function bootstrapWorktree({
  worktreePath,
  nodeExecutable = 'node',
  pnpmExecutable = 'pnpm',
  processRunner = runProcess,
  generatePrisma = true,
} = {}) {
  const realWorktree = await realpath(worktreePath).catch(() => {
    throw new BootstrapBlockedError('Worktree path does not exist', 'WORKTREE_MISSING');
  });
  const pathStat = await stat(realWorktree);
  if (!pathStat.isDirectory()) {
    throw new BootstrapBlockedError('Worktree path is not a directory', 'WORKTREE_MISSING');
  }

  const versions = await verifyRuntimeVersions({
    nodeExecutable,
    pnpmExecutable,
    processRunner,
  });
  const install = await processRunner(pnpmExecutable, [...PNPM_INSTALL_ARGUMENTS], {
    cwd: realWorktree,
    timeoutMs: 300_000,
  });
  if (install.timedOut || install.code !== 0) throw installFailure(install);

  const locks = await verifyVirtualStoreLock(realWorktree);
  const prisma = generatePrisma
    ? await runPrismaGenerate({ worktreePath: realWorktree, pnpmExecutable, processRunner })
    : null;

  return { status: 'PASS', worktreePath: realWorktree, versions, locks, prisma };
}
