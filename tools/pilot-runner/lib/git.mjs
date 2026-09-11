import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { runProcess } from './process.mjs';

export const TASK_BRANCH_PATTERN = /^athleta-pilot\/ATH-[0-9]+-[a-z0-9-]+$/;
export const ALLOWED_GIT_OPERATIONS = Object.freeze([
  'branch --show-current',
  'cat-file -e',
  'rev-parse HEAD',
  'show-ref --verify',
  'status --porcelain=v1',
  'worktree add',
  'worktree list',
]);

export class GitSafetyError extends Error {
  constructor(message, reasonCode, details = {}) {
    super(message);
    this.name = 'GitSafetyError';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

export function assertAllowedTaskBranch(branchName) {
  if (branchName === 'main' || branchName === 'master') {
    throw new GitSafetyError('Protected branch is not allowed', 'PROTECTED_BRANCH', { branchName });
  }
  if (typeof branchName !== 'string' || branchName.length === 0) {
    throw new GitSafetyError('Branch name is required', 'INVALID_BRANCH');
  }
  if (!TASK_BRANCH_PATTERN.test(branchName)) {
    throw new GitSafetyError('Branch name is outside the pilot namespace', 'INVALID_BRANCH', {
      branchName,
    });
  }
  return branchName;
}

export function assertExplicitBaseSha(baseSha) {
  if (typeof baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(baseSha)) {
    throw new GitSafetyError('Base must be an explicit full commit SHA', 'INVALID_BASE_SHA');
  }
  return baseSha;
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '' && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

export async function resolveSafeWorktreePath(worktreeRoot, requestedPath) {
  if (typeof worktreeRoot !== 'string' || typeof requestedPath !== 'string') {
    throw new GitSafetyError('Worktree paths must be strings', 'INVALID_WORKTREE_PATH');
  }
  if (!isAbsolute(worktreeRoot) || !isAbsolute(requestedPath)) {
    throw new GitSafetyError('Worktree paths must be absolute', 'INVALID_WORKTREE_PATH');
  }
  const realRoot = await realpath(worktreeRoot).catch(() => {
    throw new GitSafetyError('Worktree root must already exist', 'WORKTREE_ROOT_MISSING', {
      worktreeRoot,
    });
  });
  const absoluteCandidate = resolve(requestedPath);
  if (!isWithin(realRoot, absoluteCandidate)) {
    throw new GitSafetyError('Worktree path is outside the configured root', 'WORKTREE_PATH_OUTSIDE_ROOT');
  }

  const requestedParent = dirname(absoluteCandidate);
  const realParent = await realpath(requestedParent).catch(() => {
    throw new GitSafetyError('Worktree parent must already exist', 'WORKTREE_PARENT_MISSING');
  });
  const realCandidate = resolve(realParent, basename(absoluteCandidate));
  if (!isWithin(realRoot, realCandidate)) {
    throw new GitSafetyError('Resolved worktree path escapes the configured root', 'WORKTREE_PATH_OUTSIDE_ROOT');
  }
  return realCandidate;
}

async function runGit(repoPath, args, processRunner, timeoutMs = 30_000) {
  return processRunner('git', ['-C', repoPath, ...args], { timeoutMs });
}

async function checkedGit(repoPath, args, processRunner) {
  const result = await runGit(repoPath, args, processRunner);
  if (result.timedOut) {
    throw new GitSafetyError('Git command timed out', 'GIT_TIMEOUT');
  }
  if (result.code !== 0) {
    throw new GitSafetyError('Git command failed', 'GIT_COMMAND_FAILED', {
      stderr: result.stderr,
      code: result.code,
    });
  }
  return result.stdout.trim();
}

export async function getCheckoutSnapshot(repoPath, { processRunner = runProcess } = {}) {
  const root = await realpath(repoPath);
  const [head, branch, status] = await Promise.all([
    checkedGit(root, ['rev-parse', 'HEAD'], processRunner),
    checkedGit(root, ['branch', '--show-current'], processRunner),
    checkedGit(root, ['status', '--porcelain=v1'], processRunner),
  ]);
  return { root, head, branch, status };
}

export function assertCheckoutUnchanged(before, after) {
  if (
    before.root !== after.root ||
    before.head !== after.head ||
    before.branch !== after.branch ||
    before.status !== after.status
  ) {
    throw new GitSafetyError('Primary checkout changed during worktree creation', 'PRIMARY_CHECKOUT_CHANGED', {
      before,
      after,
    });
  }
}

function parseWorktreePaths(porcelain) {
  return porcelain
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

export async function createIsolatedWorktree({
  repoPath,
  worktreeRoot,
  targetPath,
  branchName,
  baseSha,
  processRunner = runProcess,
}) {
  assertAllowedTaskBranch(branchName);
  assertExplicitBaseSha(baseSha);
  const realRepo = await realpath(repoPath);
  const safeTarget = await resolveSafeWorktreePath(worktreeRoot, targetPath);

  try {
    await lstat(safeTarget);
    throw new GitSafetyError('Worktree target already exists', 'WORKTREE_COLLISION', {
      targetPath: safeTarget,
    });
  } catch (error) {
    if (error instanceof GitSafetyError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }

  const before = await getCheckoutSnapshot(realRepo, { processRunner });
  const commitCheck = await runGit(realRepo, ['cat-file', '-e', `${baseSha}^{commit}`], processRunner);
  if (commitCheck.code !== 0) {
    throw new GitSafetyError('Base commit does not exist', 'BASE_SHA_NOT_FOUND', { baseSha });
  }

  const branchCheck = await runGit(
    realRepo,
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    processRunner,
  );
  if (branchCheck.code === 0) {
    throw new GitSafetyError('Worktree branch already exists', 'BRANCH_COLLISION', { branchName });
  }
  if (branchCheck.code !== 1) {
    throw new GitSafetyError('Could not inspect branch collision', 'GIT_COMMAND_FAILED', {
      stderr: branchCheck.stderr,
    });
  }

  const listed = await checkedGit(realRepo, ['worktree', 'list', '--porcelain'], processRunner);
  const existingPaths = await Promise.all(
    parseWorktreePaths(listed).map((path) => realpath(path).catch(() => resolve(path))),
  );
  if (existingPaths.includes(safeTarget)) {
    throw new GitSafetyError('Worktree is already registered', 'WORKTREE_COLLISION', {
      targetPath: safeTarget,
    });
  }

  const created = await runGit(
    realRepo,
    ['worktree', 'add', '-b', branchName, safeTarget, baseSha],
    processRunner,
    60_000,
  );
  if (created.timedOut || created.code !== 0) {
    throw new GitSafetyError('Git could not create the isolated worktree', 'WORKTREE_CREATE_FAILED', {
      timedOut: created.timedOut,
      stderr: created.stderr,
    });
  }

  const after = await getCheckoutSnapshot(realRepo, { processRunner });
  assertCheckoutUnchanged(before, after);
  return { path: safeTarget, branchName, baseSha, primaryCheckout: after };
}
