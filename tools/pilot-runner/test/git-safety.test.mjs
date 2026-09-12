import assert from 'node:assert/strict';
import { access, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { addFixtureCommit, createRepositoryFixture, createRunnerFixture, fixtureGit } from './helpers.mjs';

const TASK = Object.freeze({ taskId: 'ATH-101', slug: 'safe-task' });
const BRANCH = 'athleta-pilot/ATH-101-safe-task';

async function setup(t, repositoryOptions, runnerOverrides) {
  const repository = await createRepositoryFixture(t, repositoryOptions);
  const runner = await createRunnerFixture(t, repository, runnerOverrides);
  const git = await runner.importModule('lib/git.mjs');
  return { repository, runner, git };
}

test('public context accepts only taskId and safe kebab-case slug', async (t) => {
  const { git } = await setup(t);
  for (const input of [
    {},
    Object.assign(Object.create({ repoPath: '/tmp/inherited' }), TASK),
    { taskId: 'ath-1', slug: 'safe' },
    { taskId: 'ATH-1', slug: '../escape' },
    { taskId: 'ATH-1', slug: 'Bad-Slug' },
    { taskId: 'ATH-1', slug: 'two--hyphens' },
  ]) await assert.rejects(git.createApprovedGitContext(input), (error) => error instanceof git.GitSafetyError);

  const operationalKeys = {
    approvedRepositoryRoot: '/tmp/repo', repositoryPath: '/tmp/repo', repoPath: '/tmp/repo',
    worktreeRoot: '/tmp/worktrees', stateRoot: '/tmp/state', origin: 'https://example.invalid/repo.git',
    expectedOrigin: 'https://example.invalid/repo.git', approvedBaseSha: 'a'.repeat(40),
    baseSha: 'a'.repeat(40), branchName: 'main', branch: 'master', targetPath: '/tmp/target',
    cwd: '/tmp', executable: '/bin/sh', shell: true, argv: ['-c', 'id'], args: ['-c', 'id'],
  };
  for (const [key, value] of Object.entries(operationalKeys)) {
    await assert.rejects(
      git.createApprovedGitContext({ ...TASK, [key]: value }),
      (error) => error instanceof git.GitSafetyError && error.reasonCode === 'INVALID_TASK_IDENTITY',
      key,
    );
  }
});

test('derives branch and worktree path only from fixed config and task identity', async (t) => {
  const { repository, git } = await setup(t);
  const context = await git.createApprovedGitContext(TASK);
  assert.equal(context.branchName, BRANCH);
  assert.equal(context.worktreePath, join(repository.worktreeRoot, 'ATH-101-safe-task'));
  assert.equal(context.repositoryRoot, repository.repoPath);
  assert.equal(context.origin, repository.origin);
  assert.equal(context.approvedBaseSha, repository.baseSha);
  assert.equal(Object.isFrozen(context), true);
});

test('fixed config rejects repository origin mismatch and unknown config fields', async (t) => {
  const mismatch = await setup(t, undefined, { repository: { origin: 'https://example.invalid/not-approved.git' } });
  await assert.rejects(
    mismatch.git.createApprovedGitContext(TASK),
    (error) => error instanceof mismatch.git.GitSafetyError && error.reasonCode === 'REMOTE_MISMATCH',
  );

  const unknown = await setup(t, undefined, { root: { executable: '/bin/sh' } });
  await assert.rejects(
    unknown.git.createApprovedGitContext(TASK),
    (error) => error.reasonCode === 'INVALID_PILOT_CONFIG',
  );
});

test('valid local SHA other than configured base cannot be selected', async (t) => {
  const { repository, git } = await setup(t);
  const otherSha = await addFixtureCommit(repository.repoPath);
  await assert.rejects(
    git.createApprovedGitContext({ ...TASK, baseSha: otherSha }),
    (error) => error instanceof git.GitSafetyError && error.reasonCode === 'INVALID_TASK_IDENTITY',
  );
});

test('creates the one derived worktree without changing the primary checkout', async (t) => {
  const { repository, git } = await setup(t);
  const context = await git.createApprovedGitContext(TASK);
  const before = await git.getCheckoutSnapshot(context);
  const approved = await git.createIsolatedWorktree(context);
  const after = await git.getCheckoutSnapshot(context);
  assert.deepEqual(after, before);
  assert.equal(approved.worktreePath, join(repository.worktreeRoot, 'ATH-101-safe-task'));
  assert.equal(await fixtureGit(approved.worktreePath, ['branch', '--show-current']), BRANCH);
  await access(join(approved.worktreePath, 'README.md'));
});

test('mutation and reopening accept only opaque contexts', async (t) => {
  const { repository, git } = await setup(t);
  const forged = Object.freeze({ taskId: TASK.taskId, slug: TASK.slug, repositoryRoot: repository.repoPath });
  await assert.rejects(git.createIsolatedWorktree(forged), (error) => error.reasonCode === 'INVALID_GIT_CONTEXT');
  await assert.rejects(git.approveExistingWorktree(forged), (error) => error.reasonCode === 'INVALID_GIT_CONTEXT');
  await assert.rejects(git.revalidateApprovedWorktreeContext(forged), (error) => error.reasonCode === 'INVALID_WORKTREE_CONTEXT');
  assert.equal(git.createIsolatedWorktree.length, 1);
  assert.equal(git.approveExistingWorktree.length, 1);
});

test('rejects arbitrary, unregistered, traversal, and symlink targets', async (t) => {
  const arbitrary = await setup(t);
  const arbitraryContext = await arbitrary.git.createApprovedGitContext(TASK);
  await mkdir(arbitraryContext.worktreePath);
  await assert.rejects(arbitrary.git.approveExistingWorktree(arbitraryContext), (error) => error.reasonCode === 'WORKTREE_NOT_REGISTERED');

  const linked = await setup(t);
  const linkedContext = await linked.git.createApprovedGitContext(TASK);
  await symlink(linked.repository.outsideRoot, linkedContext.worktreePath, 'dir');
  await assert.rejects(linked.git.approveExistingWorktree(linkedContext), (error) => error.reasonCode === 'WORKTREE_PATH_OUTSIDE_ROOT');

  const traversal = await setup(t);
  await assert.rejects(traversal.git.createApprovedGitContext({ taskId: 'ATH-1', slug: 'safe/../../escape' }), (error) => error.reasonCode === 'INVALID_TASK_SLUG');
});

test('reopening revalidates registered branch, base, origin, and cleanliness', async (t) => {
  const wrongBranch = await setup(t);
  const branchContext = await wrongBranch.git.createApprovedGitContext(TASK);
  await fixtureGit(wrongBranch.repository.repoPath, ['worktree', 'add', '-b', 'athleta-pilot/ATH-999-wrong', branchContext.worktreePath, wrongBranch.repository.baseSha]);
  await assert.rejects(wrongBranch.git.approveExistingWorktree(branchContext), (error) => error.reasonCode === 'BRANCH_MISMATCH');

  const wrongBase = await setup(t);
  const baseContext = await wrongBase.git.createApprovedGitContext(TASK);
  const newer = await addFixtureCommit(wrongBase.repository.repoPath);
  await fixtureGit(wrongBase.repository.repoPath, ['worktree', 'add', '-b', BRANCH, baseContext.worktreePath, newer]);
  await assert.rejects(wrongBase.git.approveExistingWorktree(baseContext), (error) => error.reasonCode === 'UNAPPROVED_BASE_SHA');

  const wrongOrigin = await setup(t);
  const originContext = await wrongOrigin.git.createApprovedGitContext(TASK);
  const originWorktree = await wrongOrigin.git.createIsolatedWorktree(originContext);
  await fixtureGit(originWorktree.worktreePath, ['remote', 'set-url', 'origin', 'https://example.invalid/changed.git']);
  await assert.rejects(wrongOrigin.git.revalidateApprovedWorktreeContext(originWorktree), (error) => error.reasonCode === 'REMOTE_MISMATCH');
});

test('approved worktree becomes invalid when it is dirty or unregistered', async (t) => {
  const dirty = await setup(t);
  const dirtyContext = await dirty.git.createApprovedGitContext(TASK);
  const dirtyWorktree = await dirty.git.createIsolatedWorktree(dirtyContext);
  await writeFile(join(dirtyWorktree.worktreePath, 'unexpected.txt'), 'dirty\n', 'utf8');
  await assert.rejects(dirty.git.revalidateApprovedWorktreeContext(dirtyWorktree), (error) => error.reasonCode === 'WORKTREE_NOT_CLEAN');

  const unregistered = await setup(t);
  const unregisteredContext = await unregistered.git.createApprovedGitContext(TASK);
  const unregisteredWorktree = await unregistered.git.createIsolatedWorktree(unregisteredContext);
  await fixtureGit(unregistered.repository.repoPath, ['worktree', 'remove', '--force', unregisteredWorktree.worktreePath]);
  await mkdir(unregisteredWorktree.worktreePath);
  await assert.rejects(unregistered.git.revalidateApprovedWorktreeContext(unregisteredWorktree), (error) => error.reasonCode === 'WORKTREE_NOT_REGISTERED');
});

test('Git public exports expose no generic command or worktree-add selector', async (t) => {
  const { git } = await setup(t);
  for (const forbidden of ['runGit', 'checkedGit', 'ALLOWED_GIT_OPERATIONS', 'assertExplicitBaseSha', 'assertApprovedBaseSha', 'resolveSafeWorktreePath', 'EXPECTED_REPOSITORY_ORIGIN']) {
    assert.equal(forbidden in git, false, forbidden);
  }
});
