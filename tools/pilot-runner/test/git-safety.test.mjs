import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALLOWED_GIT_OPERATIONS,
  approveExistingWorktree,
  assertAllowedTaskBranch,
  assertApprovedBaseSha,
  assertExplicitBaseSha,
  createApprovedGitContext,
  createIsolatedWorktree,
  EXPECTED_REPOSITORY_ORIGIN,
  getCheckoutSnapshot,
  GitSafetyError,
  resolveSafeWorktreePath,
} from '../lib/git.mjs';
import { addFixtureCommit, createRepositoryFixture, fixtureGit } from './helpers.mjs';

const BRANCH = 'athleta-pilot/ATH-101-safe-task';

async function approvedContext(fixture, overrides = {}) {
  return createApprovedGitContext({
    approvedRepositoryRoot: fixture.repoPath,
    repositoryPath: fixture.repoPath,
    worktreeRoot: fixture.worktreeRoot,
    approvedBaseSha: fixture.baseSha,
    branchName: BRANCH,
    ...overrides,
  });
}

test('rejects protected/invalid branches and accepts only the closed namespace', () => {
  for (const branch of ['main', 'master']) {
    assert.throws(
      () => assertAllowedTaskBranch(branch),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'PROTECTED_BRANCH',
    );
  }
  for (const branch of [
    '',
    'feature/ATH-101-test',
    'athleta-pilot/ath-101-test',
    'athleta-pilot/ATH-1-../x',
  ]) {
    assert.throws(
      () => assertAllowedTaskBranch(branch),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_BRANCH',
    );
  }
  assert.equal(assertAllowedTaskBranch(BRANCH), BRANCH);
  for (const ref of ['', 'main', 'a'.repeat(39), 'A'.repeat(40)]) {
    assert.throws(
      () => assertExplicitBaseSha(ref),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_BASE_SHA',
    );
  }
});

test('approved Git context rejects a different repo and an incorrect origin', async (t) => {
  const approved = await createRepositoryFixture(t);
  const other = await createRepositoryFixture(t);
  await assert.rejects(
    createApprovedGitContext({
      approvedRepositoryRoot: approved.repoPath,
      repositoryPath: other.repoPath,
      worktreeRoot: approved.worktreeRoot,
      approvedBaseSha: approved.baseSha,
      branchName: BRANCH,
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'WRONG_REPOSITORY',
  );

  const wrongOrigin = await createRepositoryFixture(t, {
    origin: 'https://github.com/example/not-athleta.git',
  });
  await assert.rejects(
    approvedContext(wrongOrigin),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'REMOTE_MISMATCH',
  );
  await assert.rejects(
    approvedContext(approved, { expectedOrigin: 'https://github.com/example/not-athleta.git' }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'REMOTE_MISMATCH',
  );
  assert.equal(EXPECTED_REPOSITORY_ORIGIN, 'https://github.com/Broco-Solutions/Athleta-001.git');
});

test('valid local SHA different from approvedBaseSha is rejected', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const context = await approvedContext(fixture);
  const otherExistingSha = await addFixtureCommit(fixture.repoPath);
  await assert.rejects(
    createIsolatedWorktree({
      context,
      targetPath: join(fixture.worktreeRoot, 'different-base'),
      baseSha: otherExistingSha,
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'UNAPPROVED_BASE_SHA',
  );
  assert.throws(
    () => assertApprovedBaseSha(context, otherExistingSha),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'UNAPPROVED_BASE_SHA',
  );
});

test('rejects paths outside the root, arbitrary directories, and unregistered worktrees', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const context = await approvedContext(fixture);
  await assert.rejects(
    resolveSafeWorktreePath(fixture.worktreeRoot, fixture.outsideRoot),
    (error) =>
      error instanceof GitSafetyError && error.reasonCode === 'WORKTREE_PATH_OUTSIDE_ROOT',
  );
  await assert.rejects(
    resolveSafeWorktreePath(fixture.worktreeRoot, 'relative-target'),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_WORKTREE_PATH',
  );

  const arbitrary = join(fixture.worktreeRoot, 'arbitrary');
  await mkdir(arbitrary);
  await assert.rejects(
    approveExistingWorktree({
      gitContext: context,
      worktreePath: arbitrary,
      branchName: BRANCH,
      baseSha: fixture.baseSha,
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'WORKTREE_NOT_REGISTERED',
  );
  await assert.rejects(
    approveExistingWorktree({
      gitContext: context,
      worktreePath: fixture.outsideRoot,
      branchName: BRANCH,
      baseSha: fixture.baseSha,
    }),
    (error) =>
      error instanceof GitSafetyError && error.reasonCode === 'WORKTREE_PATH_OUTSIDE_ROOT',
  );
});

test('rejects the primary checkout and wrong registered branch/base contexts', async (t) => {
  const primaryFixture = await createRepositoryFixture(t);
  const primaryContext = await approvedContext(primaryFixture);
  await assert.rejects(
    approveExistingWorktree({
      gitContext: primaryContext,
      worktreePath: primaryFixture.repoPath,
      branchName: BRANCH,
      baseSha: primaryFixture.baseSha,
    }),
    (error) =>
      error instanceof GitSafetyError && error.reasonCode === 'PRIMARY_CHECKOUT_FORBIDDEN',
  );

  const branchFixture = await createRepositoryFixture(t);
  const branchContext = await approvedContext(branchFixture);
  const wrongBranchPath = join(branchFixture.worktreeRoot, 'wrong-branch');
  await fixtureGit(branchFixture.repoPath, [
    'worktree',
    'add',
    '-b',
    'athleta-pilot/ATH-999-wrong',
    wrongBranchPath,
    branchFixture.baseSha,
  ]);
  await assert.rejects(
    approveExistingWorktree({
      gitContext: branchContext,
      worktreePath: wrongBranchPath,
      branchName: BRANCH,
      baseSha: branchFixture.baseSha,
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'BRANCH_MISMATCH',
  );

  const baseFixture = await createRepositoryFixture(t);
  const oldBase = baseFixture.baseSha;
  const newerSha = await addFixtureCommit(baseFixture.repoPath);
  const baseContext = await approvedContext(baseFixture, { approvedBaseSha: oldBase });
  const wrongBasePath = join(baseFixture.worktreeRoot, 'wrong-base');
  await fixtureGit(baseFixture.repoPath, [
    'worktree',
    'add',
    '-b',
    BRANCH,
    wrongBasePath,
    newerSha,
  ]);
  await assert.rejects(
    approveExistingWorktree({
      gitContext: baseContext,
      worktreePath: wrongBasePath,
      branchName: BRANCH,
      baseSha: oldBase,
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'UNAPPROVED_BASE_SHA',
  );
});

test('creates a real isolated worktree without changing the primary checkout', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const context = await approvedContext(fixture);
  const before = await getCheckoutSnapshot(context);
  const targetPath = join(fixture.worktreeRoot, 'ATH-101-safe-task');
  const worktreeContext = await createIsolatedWorktree({ context, targetPath });
  const after = await getCheckoutSnapshot(context);
  assert.deepEqual(after, before);
  assert.equal(worktreeContext.repositoryRoot, fixture.repoPath);
  assert.equal(worktreeContext.worktreePath, targetPath);
  assert.equal(worktreeContext.approvedBaseSha, fixture.baseSha);
  assert.equal(await fixtureGit(targetPath, ['branch', '--show-current']), BRANCH);
  await access(join(targetPath, 'README.md'));
});

test('Git mutation requires an opaque approved context', async (t) => {
  const fixture = await createRepositoryFixture(t);
  await assert.rejects(
    createIsolatedWorktree({
      context: Object.freeze({
        repositoryRoot: fixture.repoPath,
        origin: EXPECTED_REPOSITORY_ORIGIN,
        worktreeRoot: fixture.worktreeRoot,
        approvedBaseSha: fixture.baseSha,
        branchName: BRANCH,
      }),
      targetPath: join(fixture.worktreeRoot, 'forged'),
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_GIT_CONTEXT',
  );
});

test('git module exposes no destructive or delivery operation', () => {
  const operations = ALLOWED_GIT_OPERATIONS.join(' ');
  for (const forbidden of ['merge', 'rebase', 'push', 'reset', 'clean', 'deploy', 'worktree remove']) {
    assert.equal(operations.includes(forbidden), false, `unexpected operation: ${forbidden}`);
  }
});
