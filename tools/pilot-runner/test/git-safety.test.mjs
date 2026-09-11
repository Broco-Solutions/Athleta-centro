import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALLOWED_GIT_OPERATIONS,
  assertAllowedTaskBranch,
  assertExplicitBaseSha,
  createIsolatedWorktree,
  getCheckoutSnapshot,
  GitSafetyError,
  resolveSafeWorktreePath,
} from '../lib/git.mjs';
import { runProcess } from '../lib/process.mjs';

test('rejects protected and invalid branches and accepts the closed namespace', () => {
  for (const branch of ['main', 'master']) {
    assert.throws(
      () => assertAllowedTaskBranch(branch),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'PROTECTED_BRANCH',
    );
  }
  for (const branch of ['', 'feature/ATH-101-test', 'athleta-pilot/ath-101-test', 'athleta-pilot/ATH-1-../x']) {
    assert.throws(
      () => assertAllowedTaskBranch(branch),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_BRANCH',
    );
  }
  assert.equal(assertAllowedTaskBranch('athleta-pilot/ATH-101-safe-task'), 'athleta-pilot/ATH-101-safe-task');
  for (const ref of ['', 'main', 'a'.repeat(39), 'A'.repeat(40)]) {
    assert.throws(
      () => assertExplicitBaseSha(ref),
      (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_BASE_SHA',
    );
  }
  assert.equal(assertExplicitBaseSha('a'.repeat(40)), 'a'.repeat(40));
});

test('rejects paths outside the worktree root and existing collisions', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-git-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const worktreeRoot = join(root, 'worktrees');
  await mkdir(worktreeRoot);
  await assert.rejects(
    resolveSafeWorktreePath(worktreeRoot, join(root, 'outside')),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'WORKTREE_PATH_OUTSIDE_ROOT',
  );
  await assert.rejects(
    resolveSafeWorktreePath(worktreeRoot, 'relative-target'),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'INVALID_WORKTREE_PATH',
  );

  const collision = join(worktreeRoot, 'ATH-101-safe-task');
  await mkdir(collision);
  await assert.rejects(
    createIsolatedWorktree({
      repoPath: root,
      worktreeRoot,
      targetPath: collision,
      branchName: 'athleta-pilot/ATH-101-safe-task',
      baseSha: 'a'.repeat(40),
    }),
    (error) => error instanceof GitSafetyError && error.reasonCode === 'WORKTREE_COLLISION',
  );
});

async function git(repoPath, args) {
  const result = await runProcess('git', ['-C', repoPath, ...args], { timeoutMs: 10_000 });
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

test('creates a real isolated worktree without changing the primary checkout', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-git-real-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoPath = join(root, 'repo');
  const worktreeRoot = join(root, 'worktrees');
  await mkdir(repoPath);
  await mkdir(worktreeRoot);
  await git(repoPath, ['init', '-b', 'trunk']);
  await writeFile(join(repoPath, 'README.md'), 'controlled test repository\n', 'utf8');
  await git(repoPath, ['add', 'README.md']);
  await git(repoPath, [
    '-c',
    'user.name=Pilot Test',
    '-c',
    'user.email=pilot@example.invalid',
    'commit',
    '-m',
    'test fixture',
  ]);
  const baseSha = await git(repoPath, ['rev-parse', 'HEAD']);
  const before = await getCheckoutSnapshot(repoPath);
  const targetPath = join(worktreeRoot, 'ATH-101-safe-task');
  const created = await createIsolatedWorktree({
    repoPath,
    worktreeRoot,
    targetPath,
    branchName: 'athleta-pilot/ATH-101-safe-task',
    baseSha,
  });
  const after = await getCheckoutSnapshot(repoPath);
  assert.deepEqual(after, before);
  assert.equal(created.primaryCheckout.head, before.head);
  assert.equal(await git(targetPath, ['branch', '--show-current']), 'athleta-pilot/ATH-101-safe-task');
  await access(join(targetPath, 'README.md'));
});

test('git module exposes no destructive or delivery operation', () => {
  const operations = ALLOWED_GIT_OPERATIONS.join(' ');
  for (const forbidden of ['merge', 'rebase', 'push', 'reset', 'clean', 'deploy', 'worktree remove']) {
    assert.equal(operations.includes(forbidden), false, `unexpected operation: ${forbidden}`);
  }
});
