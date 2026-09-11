import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { runTechnicalOperation, TECHNICAL_OPERATIONS } from './process.mjs';

export const EXPECTED_REPOSITORY_ORIGIN =
  'https://github.com/Broco-Solutions/Athleta-001.git';
export const TASK_BRANCH_PATTERN = /^athleta-pilot\/ATH-[0-9]+-[a-z0-9-]+$/;
export const ALLOWED_GIT_OPERATIONS = Object.freeze([
  'branch --show-current',
  'cat-file -e',
  'config --get remote.origin.url',
  'rev-parse HEAD',
  'rev-parse --show-toplevel',
  'show-ref --verify',
  'status --porcelain=v1',
  'worktree add',
  'worktree list',
]);

const approvedGitContexts = new WeakSet();
const approvedWorktreeContexts = new WeakSet();

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
  return (
    pathFromRoot !== '' &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
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

async function runGit(operation, parameters, timeoutMs = 30_000) {
  return runTechnicalOperation(operation, parameters, { timeoutMs });
}

async function checkedGit(operation, parameters, timeoutMs) {
  const result = await runGit(operation, parameters, timeoutMs);
  if (result.timedOut) throw new GitSafetyError('Git command timed out', 'GIT_TIMEOUT');
  if (result.code !== 0) {
    throw new GitSafetyError('Git command failed', 'GIT_COMMAND_FAILED', {
      stderr: result.stderr,
      code: result.code,
    });
  }
  return result.stdout.trim();
}

function assertApprovedGitContext(context) {
  if (!context || !approvedGitContexts.has(context) || !Object.isFrozen(context)) {
    throw new GitSafetyError('Approved Git context is required', 'INVALID_GIT_CONTEXT');
  }
  return context;
}

function assertApprovedWorktreeContext(context) {
  if (!context || !approvedWorktreeContexts.has(context) || !Object.isFrozen(context)) {
    throw new GitSafetyError('Approved worktree context is required', 'INVALID_WORKTREE_CONTEXT');
  }
  return context;
}

export function assertApprovedBaseSha(context, requestedBaseSha) {
  const approved = assertApprovedGitContext(context);
  assertExplicitBaseSha(requestedBaseSha);
  if (requestedBaseSha !== approved.approvedBaseSha) {
    throw new GitSafetyError('Requested base differs from the approved run base', 'UNAPPROVED_BASE_SHA', {
      approvedBaseSha: approved.approvedBaseSha,
      requestedBaseSha,
    });
  }
  return requestedBaseSha;
}

export async function createApprovedGitContext({
  approvedRepositoryRoot,
  repositoryPath = approvedRepositoryRoot,
  worktreeRoot,
  approvedBaseSha,
  branchName,
  expectedOrigin = EXPECTED_REPOSITORY_ORIGIN,
}) {
  assertAllowedTaskBranch(branchName);
  assertExplicitBaseSha(approvedBaseSha);
  if (expectedOrigin !== EXPECTED_REPOSITORY_ORIGIN) {
    throw new GitSafetyError('Repository identity is not approved for this pilot', 'REMOTE_MISMATCH');
  }
  if (
    ![approvedRepositoryRoot, repositoryPath, worktreeRoot].every(
      (path) => typeof path === 'string' && isAbsolute(path),
    )
  ) {
    throw new GitSafetyError('Approved Git paths must be absolute', 'INVALID_GIT_CONTEXT');
  }

  const [approvedRoot, actualRoot, realWorktreeRoot] = await Promise.all([
    realpath(approvedRepositoryRoot).catch(() => null),
    realpath(repositoryPath).catch(() => null),
    realpath(worktreeRoot).catch(() => null),
  ]);
  if (!approvedRoot || !actualRoot || actualRoot !== approvedRoot) {
    throw new GitSafetyError('Repository path differs from the approved root', 'WRONG_REPOSITORY');
  }
  if (!realWorktreeRoot) {
    throw new GitSafetyError('Worktree root must already exist', 'WORKTREE_ROOT_MISSING');
  }
  if (realWorktreeRoot === approvedRoot || isWithin(realWorktreeRoot, approvedRoot)) {
    throw new GitSafetyError('Primary checkout cannot be inside the worktree root', 'UNSAFE_WORKTREE_ROOT');
  }

  const topLevel = await checkedGit(TECHNICAL_OPERATIONS.GIT_REV_PARSE, {
    repoPath: actualRoot,
    ref: '--show-toplevel',
  }).catch(() => null);
  const realTopLevel = topLevel ? await realpath(topLevel).catch(() => null) : null;
  if (realTopLevel !== approvedRoot) {
    throw new GitSafetyError('Repository path is not the approved Git top-level', 'WRONG_REPOSITORY');
  }

  const origin = await checkedGit(TECHNICAL_OPERATIONS.GIT_ORIGIN, { repoPath: actualRoot }).catch(
    () => null,
  );
  if (origin !== EXPECTED_REPOSITORY_ORIGIN) {
    throw new GitSafetyError('Origin does not identify the approved repository', 'REMOTE_MISMATCH', {
      origin,
    });
  }
  const commit = await runGit(TECHNICAL_OPERATIONS.GIT_COMMIT_EXISTS, {
    repoPath: actualRoot,
    sha: approvedBaseSha,
  });
  if (commit.code !== 0) {
    throw new GitSafetyError('Approved base commit does not exist', 'BASE_SHA_NOT_FOUND', {
      approvedBaseSha,
    });
  }

  const context = Object.freeze({
    repositoryRoot: approvedRoot,
    origin: EXPECTED_REPOSITORY_ORIGIN,
    worktreeRoot: realWorktreeRoot,
    approvedBaseSha,
    branchName,
  });
  approvedGitContexts.add(context);
  return context;
}

export async function getCheckoutSnapshot(context) {
  const approved = assertApprovedGitContext(context);
  const [head, branch, status] = await Promise.all([
    checkedGit(TECHNICAL_OPERATIONS.GIT_REV_PARSE, {
      repoPath: approved.repositoryRoot,
      ref: 'HEAD',
    }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_BRANCH_CURRENT, {
      repoPath: approved.repositoryRoot,
    }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_STATUS, { repoPath: approved.repositoryRoot }),
  ]);
  return { root: approved.repositoryRoot, head, branch, status };
}

export function assertCheckoutUnchanged(before, after) {
  if (
    before.root !== after.root ||
    before.head !== after.head ||
    before.branch !== after.branch ||
    before.status !== after.status
  ) {
    throw new GitSafetyError(
      'Primary checkout changed during worktree creation',
      'PRIMARY_CHECKOUT_CHANGED',
      { before, after },
    );
  }
}

function parseWorktreePaths(porcelain) {
  return porcelain
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

async function assertRegisteredWorktree(gitContext, worktreePath) {
  const listed = await checkedGit(TECHNICAL_OPERATIONS.GIT_WORKTREE_LIST, {
    repoPath: gitContext.repositoryRoot,
  });
  const existingPaths = await Promise.all(
    parseWorktreePaths(listed).map((path) => realpath(path).catch(() => resolve(path))),
  );
  if (!existingPaths.includes(worktreePath)) {
    throw new GitSafetyError('Worktree is not registered in the approved repository', 'WORKTREE_NOT_REGISTERED');
  }
}

async function inspectApprovedWorktree(gitContext, worktreePath) {
  const approved = assertApprovedGitContext(gitContext);
  if (typeof worktreePath !== 'string' || !isAbsolute(worktreePath)) {
    throw new GitSafetyError('Worktree path must be absolute', 'INVALID_WORKTREE_PATH');
  }
  const realWorktree = await realpath(worktreePath).catch(() => {
    throw new GitSafetyError('Worktree path does not exist', 'WORKTREE_MISSING');
  });
  if (realWorktree === approved.repositoryRoot) {
    throw new GitSafetyError('Primary checkout cannot be bootstrapped', 'PRIMARY_CHECKOUT_FORBIDDEN');
  }
  if (!isWithin(approved.worktreeRoot, realWorktree)) {
    throw new GitSafetyError('Worktree path is outside the approved root', 'WORKTREE_PATH_OUTSIDE_ROOT');
  }
  await assertRegisteredWorktree(approved, realWorktree);

  const [topLevel, origin, branch, head, status] = await Promise.all([
    checkedGit(TECHNICAL_OPERATIONS.GIT_REV_PARSE, {
      repoPath: realWorktree,
      ref: '--show-toplevel',
    }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_ORIGIN, { repoPath: realWorktree }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_BRANCH_CURRENT, { repoPath: realWorktree }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_REV_PARSE, { repoPath: realWorktree, ref: 'HEAD' }),
    checkedGit(TECHNICAL_OPERATIONS.GIT_STATUS, { repoPath: realWorktree }),
  ]);
  const realTopLevel = await realpath(topLevel).catch(() => null);
  if (realTopLevel !== realWorktree) {
    throw new GitSafetyError('Registered path is not its Git top-level', 'WRONG_REPOSITORY');
  }
  if (origin !== approved.origin) {
    throw new GitSafetyError('Worktree origin does not match approved identity', 'REMOTE_MISMATCH');
  }
  if (branch !== approved.branchName) {
    throw new GitSafetyError('Worktree branch differs from approved branch', 'BRANCH_MISMATCH', {
      expected: approved.branchName,
      actual: branch,
    });
  }
  if (head !== approved.approvedBaseSha) {
    throw new GitSafetyError('Worktree HEAD differs from approved base', 'UNAPPROVED_BASE_SHA', {
      approvedBaseSha: approved.approvedBaseSha,
      actual: head,
    });
  }
  if (status !== '') {
    throw new GitSafetyError('Worktree has an unexpected unsafe condition', 'WORKTREE_NOT_CLEAN');
  }
  return realWorktree;
}

export async function approveExistingWorktree({
  gitContext,
  worktreePath,
  branchName,
  baseSha,
}) {
  const approved = assertApprovedGitContext(gitContext);
  if (branchName !== approved.branchName) {
    throw new GitSafetyError('Requested branch differs from approved context', 'BRANCH_MISMATCH');
  }
  assertApprovedBaseSha(approved, baseSha);
  const realWorktree = await inspectApprovedWorktree(approved, worktreePath);
  const context = Object.freeze({
    repositoryRoot: approved.repositoryRoot,
    origin: approved.origin,
    worktreeRoot: approved.worktreeRoot,
    worktreePath: realWorktree,
    branchName: approved.branchName,
    approvedBaseSha: approved.approvedBaseSha,
    gitContext: approved,
  });
  approvedWorktreeContexts.add(context);
  return context;
}

export async function revalidateApprovedWorktreeContext(context) {
  const approved = assertApprovedWorktreeContext(context);
  if (
    approved.repositoryRoot !== approved.gitContext.repositoryRoot ||
    approved.origin !== approved.gitContext.origin ||
    approved.worktreeRoot !== approved.gitContext.worktreeRoot ||
    approved.branchName !== approved.gitContext.branchName ||
    approved.approvedBaseSha !== approved.gitContext.approvedBaseSha
  ) {
    throw new GitSafetyError('Worktree context was altered', 'INVALID_WORKTREE_CONTEXT');
  }
  await inspectApprovedWorktree(approved.gitContext, approved.worktreePath);
  return approved;
}

export async function createIsolatedWorktree({
  context,
  targetPath,
  branchName = context?.branchName,
  baseSha = context?.approvedBaseSha,
}) {
  const approved = assertApprovedGitContext(context);
  if (branchName !== approved.branchName) {
    throw new GitSafetyError('Requested branch differs from approved context', 'BRANCH_MISMATCH');
  }
  assertApprovedBaseSha(approved, baseSha);
  const safeTarget = await resolveSafeWorktreePath(approved.worktreeRoot, targetPath);

  try {
    await lstat(safeTarget);
    throw new GitSafetyError('Worktree target already exists', 'WORKTREE_COLLISION', {
      targetPath: safeTarget,
    });
  } catch (error) {
    if (error instanceof GitSafetyError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }

  const before = await getCheckoutSnapshot(approved);
  const branchCheck = await runGit(TECHNICAL_OPERATIONS.GIT_BRANCH_EXISTS, {
    repoPath: approved.repositoryRoot,
    branchName: approved.branchName,
  });
  if (branchCheck.code === 0) {
    throw new GitSafetyError('Worktree branch already exists', 'BRANCH_COLLISION', {
      branchName: approved.branchName,
    });
  }
  if (branchCheck.code !== 1) {
    throw new GitSafetyError('Could not inspect branch collision', 'GIT_COMMAND_FAILED', {
      stderr: branchCheck.stderr,
    });
  }

  const listed = await checkedGit(TECHNICAL_OPERATIONS.GIT_WORKTREE_LIST, {
    repoPath: approved.repositoryRoot,
  });
  const existingPaths = await Promise.all(
    parseWorktreePaths(listed).map((path) => realpath(path).catch(() => resolve(path))),
  );
  if (existingPaths.includes(safeTarget)) {
    throw new GitSafetyError('Worktree is already registered', 'WORKTREE_COLLISION', {
      targetPath: safeTarget,
    });
  }

  const created = await runGit(
    TECHNICAL_OPERATIONS.GIT_WORKTREE_ADD,
    {
      repoPath: approved.repositoryRoot,
      branchName: approved.branchName,
      targetPath: safeTarget,
      baseSha: approved.approvedBaseSha,
    },
    60_000,
  );
  if (created.timedOut || created.code !== 0) {
    throw new GitSafetyError('Git could not create the isolated worktree', 'WORKTREE_CREATE_FAILED', {
      timedOut: created.timedOut,
      stderr: created.stderr,
    });
  }

  const after = await getCheckoutSnapshot(approved);
  assertCheckoutUnchanged(before, after);
  return approveExistingWorktree({
    gitContext: approved,
    worktreePath: safeTarget,
    branchName: approved.branchName,
    baseSha: approved.approvedBaseSha,
  });
}
