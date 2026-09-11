import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { EXPECTED_REPOSITORY_ORIGIN } from '../lib/git.mjs';

const execFileAsync = promisify(execFile);

export async function fixtureGit(repoPath, args) {
  const { stdout } = await execFileAsync('/usr/bin/git', ['-C', repoPath, ...args], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
  });
  return stdout.trim();
}

export async function createRepositoryFixture(
  t,
  { origin = EXPECTED_REPOSITORY_ORIGIN, files = { 'README.md': 'controlled fixture\n' } } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'athleta-pilot-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoPath = join(root, 'repo');
  const worktreeRoot = join(root, 'worktrees');
  const outsideRoot = join(root, 'outside');
  await Promise.all([
    mkdir(repoPath),
    mkdir(worktreeRoot),
    mkdir(outsideRoot),
  ]);
  await fixtureGit(repoPath, ['init', '-b', 'trunk']);
  await fixtureGit(repoPath, ['remote', 'add', 'origin', origin]);
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(repoPath, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
  await fixtureGit(repoPath, ['add', '.']);
  await fixtureGit(repoPath, [
    '-c',
    'user.name=Pilot Test',
    '-c',
    'user.email=pilot@example.invalid',
    'commit',
    '-m',
    'fixture base',
  ]);
  const baseSha = await fixtureGit(repoPath, ['rev-parse', 'HEAD']);
  assert.match(baseSha, /^[0-9a-f]{40}$/);
  return { root, repoPath, worktreeRoot, outsideRoot, baseSha };
}

export async function addFixtureCommit(repoPath, relativePath = 'SECOND.md') {
  await writeFile(join(repoPath, relativePath), 'second controlled fixture\n', 'utf8');
  await fixtureGit(repoPath, ['add', relativePath]);
  await fixtureGit(repoPath, [
    '-c',
    'user.name=Pilot Test',
    '-c',
    'user.email=pilot@example.invalid',
    'commit',
    '-m',
    'fixture second',
  ]);
  return fixtureGit(repoPath, ['rev-parse', 'HEAD']);
}
