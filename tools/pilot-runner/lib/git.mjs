import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadPilotConfig } from './config.mjs';
import { executeTrustedCommand } from './internal/process-supervisor.mjs';

const TASK_ID_PATTERN = /^ATH-[0-9]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_BRANCH_PATTERN = /^athleta-pilot\/ATH-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const GIT = '/usr/bin/git';
const CONTEXT_KEYS = new Set(['taskId', 'slug']);
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

function isWithin(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function assertClosedTaskInput(input) {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new GitSafetyError('Task identity must be an object', 'INVALID_TASK_IDENTITY');
  }
  for (const key of Object.keys(input)) {
    if (!CONTEXT_KEYS.has(key)) {
      throw new GitSafetyError(`Task identity cannot select operational field "${key}"`, 'INVALID_TASK_IDENTITY');
    }
  }
  if (!TASK_ID_PATTERN.test(input.taskId)) {
    throw new GitSafetyError('taskId must match ATH-[0-9]+', 'INVALID_TASK_ID');
  }
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new GitSafetyError('slug must be safe kebab-case', 'INVALID_TASK_SLUG');
  }
  return input;
}

async function git(repoPath, args, timeoutMs = 30_000) {
  return executeTrustedCommand({ executablePath: GIT, args: ['-C', repoPath, ...args] }, { timeoutMs });
}

async function checkedGit(repoPath, args, timeoutMs) {
  const result = await git(repoPath, args, timeoutMs);
  if (result.timedOut) throw new GitSafetyError('Git command timed out', 'GIT_TIMEOUT');
  if (result.code !== 0) {
    throw new GitSafetyError('Git command failed', 'GIT_COMMAND_FAILED', { code: result.code, stderr: result.stderr });
  }
  return result.stdout.trim();
}

async function canonicalConfiguredRoots(config) {
  const [repositoryRoot, worktreeRoot] = await Promise.all([
    realpath(config.repository.root).catch(() => null),
    realpath(config.paths.worktreeRoot).catch(() => null),
  ]);
  if (!repositoryRoot) throw new GitSafetyError('Configured repository does not exist', 'WRONG_REPOSITORY');
  if (!worktreeRoot) throw new GitSafetyError('Configured worktree root does not exist', 'WORKTREE_ROOT_MISSING');
  if (repositoryRoot === worktreeRoot || isWithin(worktreeRoot, repositoryRoot)) {
    throw new GitSafetyError('Primary checkout cannot be inside the worktree root', 'UNSAFE_WORKTREE_ROOT');
  }
  return { repositoryRoot, worktreeRoot };
}

async function validateRepository(config, repositoryRoot) {
  const [topLevel, origin, base] = await Promise.all([
    checkedGit(repositoryRoot, ['rev-parse', '--show-toplevel']).catch(() => null),
    checkedGit(repositoryRoot, ['config', '--get', 'remote.origin.url']).catch(() => null),
    git(repositoryRoot, ['cat-file', '-e', `${config.repository.approvedBaseSha}^{commit}`]),
  ]);
  const realTopLevel = topLevel ? await realpath(topLevel).catch(() => null) : null;
  if (realTopLevel !== repositoryRoot) throw new GitSafetyError('Configured path is not its Git top-level', 'WRONG_REPOSITORY');
  if (origin !== config.repository.origin) throw new GitSafetyError('Origin does not match fixed pilot authority', 'REMOTE_MISMATCH', { origin });
  if (base.code !== 0 || base.timedOut) throw new GitSafetyError('Configured base commit is unavailable', 'BASE_SHA_NOT_FOUND');
}

function assertGitContext(context) {
  if (!context || !approvedGitContexts.has(context) || !Object.isFrozen(context)) {
    throw new GitSafetyError('Approved Git context is required', 'INVALID_GIT_CONTEXT');
  }
  return context;
}

function assertWorktreeContext(context) {
  if (!context || !approvedWorktreeContexts.has(context) || !Object.isFrozen(context)) {
    throw new GitSafetyError('Approved worktree context is required', 'INVALID_WORKTREE_CONTEXT');
  }
  return context;
}

async function revalidateGitContext(context, { requireClean = true } = {}) {
  const approved = assertGitContext(context);
  const config = await loadPilotConfig();
  const roots = await canonicalConfiguredRoots(config);
  const expectedBranch = `athleta-pilot/${approved.taskId}-${approved.slug}`;
  const expectedPath = join(roots.worktreeRoot, `${approved.taskId}-${approved.slug}`);
  if (
    roots.repositoryRoot !== approved.repositoryRoot ||
    roots.worktreeRoot !== approved.worktreeRoot ||
    config.repository.origin !== approved.origin ||
    config.repository.approvedBaseSha !== approved.approvedBaseSha ||
    expectedBranch !== approved.branchName ||
    expectedPath !== approved.worktreePath
  ) {
    throw new GitSafetyError('Fixed pilot authority changed after context approval', 'INVALID_GIT_CONTEXT');
  }
  await validateRepository(config, roots.repositoryRoot);
  if (requireClean) {
    const status = await checkedGit(roots.repositoryRoot, ['status', '--porcelain=v1']);
    if (status !== '') throw new GitSafetyError('Primary checkout must be clean', 'PRIMARY_CHECKOUT_NOT_CLEAN');
  }
  return approved;
}

export async function createApprovedGitContext(input) {
  if (arguments.length !== 1) throw new GitSafetyError('Exactly one task identity is required', 'INVALID_TASK_IDENTITY');
  const { taskId, slug } = assertClosedTaskInput(input);
  const config = await loadPilotConfig();
  const { repositoryRoot, worktreeRoot } = await canonicalConfiguredRoots(config);
  await validateRepository(config, repositoryRoot);
  const branchName = `athleta-pilot/${taskId}-${slug}`;
  const worktreePath = join(worktreeRoot, `${taskId}-${slug}`);
  if (!TASK_BRANCH_PATTERN.test(branchName)) throw new GitSafetyError('Derived branch is unsafe', 'INVALID_BRANCH');
  const context = Object.freeze({
    taskId,
    slug,
    repositoryRoot,
    origin: config.repository.origin,
    approvedBaseSha: config.repository.approvedBaseSha,
    worktreeRoot,
    worktreePath,
    branchName,
  });
  approvedGitContexts.add(context);
  return context;
}

export async function getCheckoutSnapshot(context) {
  if (arguments.length !== 1) throw new GitSafetyError('Exactly one approved context is required', 'INVALID_GIT_CONTEXT');
  const approved = await revalidateGitContext(context, { requireClean: false });
  const [head, branch, status] = await Promise.all([
    checkedGit(approved.repositoryRoot, ['rev-parse', 'HEAD']),
    checkedGit(approved.repositoryRoot, ['branch', '--show-current']),
    checkedGit(approved.repositoryRoot, ['status', '--porcelain=v1']),
  ]);
  return { root: approved.repositoryRoot, head, branch, status };
}

function assertCheckoutUnchanged(before, after) {
  if (before.root !== after.root || before.head !== after.head || before.branch !== after.branch || before.status !== after.status) {
    throw new GitSafetyError('Primary checkout changed during worktree creation', 'PRIMARY_CHECKOUT_CHANGED', { before, after });
  }
}

function parseWorktreePaths(porcelain) {
  return porcelain.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
}

async function registeredPaths(context) {
  const listed = await checkedGit(context.repositoryRoot, ['worktree', 'list', '--porcelain']);
  return Promise.all(parseWorktreePaths(listed).map((path) => realpath(path).catch(() => resolve(path))));
}

async function safeDerivedTarget(context, { mustExist }) {
  const root = await realpath(context.worktreeRoot);
  const requestedParent = await realpath(dirname(context.worktreePath)).catch(() => null);
  if (requestedParent !== root) throw new GitSafetyError('Derived worktree parent is not canonical', 'WORKTREE_PATH_OUTSIDE_ROOT');
  const candidate = resolve(requestedParent, basename(context.worktreePath));
  if (!isWithin(root, candidate)) throw new GitSafetyError('Derived worktree escapes configured root', 'WORKTREE_PATH_OUTSIDE_ROOT');
  if (!mustExist) return candidate;
  const realCandidate = await realpath(candidate).catch(() => null);
  if (!realCandidate) throw new GitSafetyError('Derived worktree does not exist', 'WORKTREE_MISSING');
  if (realCandidate !== candidate || !isWithin(root, realCandidate)) throw new GitSafetyError('Worktree symlink or traversal is forbidden', 'WORKTREE_PATH_OUTSIDE_ROOT');
  return realCandidate;
}

async function inspectWorktree(gitContext) {
  const approved = await revalidateGitContext(gitContext);
  const worktreePath = await safeDerivedTarget(approved, { mustExist: true });
  if (worktreePath === approved.repositoryRoot) throw new GitSafetyError('Primary checkout cannot be approved as a worktree', 'PRIMARY_CHECKOUT_FORBIDDEN');
  if (!(await registeredPaths(approved)).includes(worktreePath)) throw new GitSafetyError('Worktree is not registered', 'WORKTREE_NOT_REGISTERED');
  const [topLevel, origin, branch, head, status] = await Promise.all([
    checkedGit(worktreePath, ['rev-parse', '--show-toplevel']),
    checkedGit(worktreePath, ['config', '--get', 'remote.origin.url']),
    checkedGit(worktreePath, ['branch', '--show-current']),
    checkedGit(worktreePath, ['rev-parse', 'HEAD']),
    checkedGit(worktreePath, ['status', '--porcelain=v1']),
  ]);
  if (await realpath(topLevel).catch(() => null) !== worktreePath) throw new GitSafetyError('Registered worktree is not its Git top-level', 'WRONG_REPOSITORY');
  if (origin !== approved.origin) throw new GitSafetyError('Worktree origin differs from fixed authority', 'REMOTE_MISMATCH');
  if (branch !== approved.branchName) throw new GitSafetyError('Worktree branch differs from derived branch', 'BRANCH_MISMATCH');
  if (head !== approved.approvedBaseSha) throw new GitSafetyError('Worktree HEAD differs from fixed base', 'UNAPPROVED_BASE_SHA');
  if (status !== '') throw new GitSafetyError('Worktree must be clean', 'WORKTREE_NOT_CLEAN');
  return worktreePath;
}

export async function approveExistingWorktree(context) {
  if (arguments.length !== 1) throw new GitSafetyError('Exactly one approved context is required', 'INVALID_GIT_CONTEXT');
  const approved = await revalidateGitContext(context);
  const worktreePath = await inspectWorktree(approved);
  const worktreeContext = Object.freeze({
    taskId: approved.taskId,
    slug: approved.slug,
    repositoryRoot: approved.repositoryRoot,
    origin: approved.origin,
    approvedBaseSha: approved.approvedBaseSha,
    worktreeRoot: approved.worktreeRoot,
    worktreePath,
    branchName: approved.branchName,
    gitContext: approved,
  });
  approvedWorktreeContexts.add(worktreeContext);
  return worktreeContext;
}

export async function revalidateApprovedWorktreeContext(context) {
  if (arguments.length !== 1) throw new GitSafetyError('Exactly one worktree context is required', 'INVALID_WORKTREE_CONTEXT');
  const approved = assertWorktreeContext(context);
  const gitContext = await revalidateGitContext(approved.gitContext);
  if (
    approved.repositoryRoot !== gitContext.repositoryRoot ||
    approved.origin !== gitContext.origin ||
    approved.approvedBaseSha !== gitContext.approvedBaseSha ||
    approved.worktreeRoot !== gitContext.worktreeRoot ||
    approved.worktreePath !== gitContext.worktreePath ||
    approved.branchName !== gitContext.branchName
  ) throw new GitSafetyError('Approved worktree context was altered', 'INVALID_WORKTREE_CONTEXT');
  await inspectWorktree(gitContext);
  return approved;
}

export async function createIsolatedWorktree(context) {
  if (arguments.length !== 1) throw new GitSafetyError('Exactly one approved context is required', 'INVALID_GIT_CONTEXT');
  const approved = await revalidateGitContext(context);
  const target = await safeDerivedTarget(approved, { mustExist: false });
  try {
    await lstat(target);
    throw new GitSafetyError('Derived worktree target already exists', 'WORKTREE_COLLISION');
  } catch (error) {
    if (error instanceof GitSafetyError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const before = await getCheckoutSnapshot(approved);
  const branchCheck = await git(approved.repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${approved.branchName}`]);
  if (branchCheck.code === 0) throw new GitSafetyError('Derived worktree branch already exists', 'BRANCH_COLLISION');
  if (branchCheck.code !== 1) throw new GitSafetyError('Could not inspect branch collision', 'GIT_COMMAND_FAILED', { stderr: branchCheck.stderr });
  if ((await registeredPaths(approved)).includes(target)) throw new GitSafetyError('Derived worktree is already registered', 'WORKTREE_COLLISION');

  // This is the sole production path to `git worktree add`; every value is derived
  // from the revalidated, fixed-authority context immediately above.
  const created = await git(approved.repositoryRoot, ['worktree', 'add', '-b', approved.branchName, target, approved.approvedBaseSha], 60_000);
  if (created.timedOut || created.code !== 0) throw new GitSafetyError('Git could not create the isolated worktree', 'WORKTREE_CREATE_FAILED', { timedOut: created.timedOut, stderr: created.stderr });
  assertCheckoutUnchanged(before, await getCheckoutSnapshot(approved));
  return approveExistingWorktree(approved);
}

export async function inspectConfiguredRepository() {
  if (arguments.length !== 0) throw new GitSafetyError('Configured repository inspection accepts no arguments', 'INVALID_GIT_CONTEXT');
  const config = await loadPilotConfig();
  const { repositoryRoot } = await canonicalConfiguredRoots(config);
  await validateRepository(config, repositoryRoot);
  const [origin, main, originMain, status] = await Promise.all([
    checkedGit(repositoryRoot, ['config', '--get', 'remote.origin.url']),
    checkedGit(repositoryRoot, ['rev-parse', 'main']),
    checkedGit(repositoryRoot, ['rev-parse', 'origin/main']),
    checkedGit(repositoryRoot, ['status', '--porcelain=v1', '--branch']),
  ]);
  return { repositoryRoot, origin, main, originMain, status };
}
