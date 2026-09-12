import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const FIXTURE_ORIGIN = 'https://github.com/Broco-Solutions/Athleta-001.git';
const execFileAsync = promisify(execFile);
const sourceRunnerRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function fixtureGit(repoPath, args) {
  const { stdout } = await execFileAsync('/usr/bin/git', ['-C', repoPath, ...args], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
  });
  return stdout.trim();
}

export async function createRepositoryFixture(
  t,
  { origin = FIXTURE_ORIGIN, files = { 'README.md': 'controlled fixture\n' } } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'athleta-pilot-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoPath = join(root, 'repo');
  const worktreeRoot = join(root, 'worktrees');
  const stateRoot = join(root, 'state');
  const outsideRoot = join(root, 'outside');
  await Promise.all([mkdir(repoPath), mkdir(worktreeRoot), mkdir(stateRoot), mkdir(outsideRoot)]);
  await fixtureGit(repoPath, ['init', '-b', 'trunk']);
  await fixtureGit(repoPath, ['remote', 'add', 'origin', origin]);
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(repoPath, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
  await fixtureGit(repoPath, ['add', '.']);
  await fixtureGit(repoPath, ['-c', 'user.name=Pilot Test', '-c', 'user.email=pilot@example.invalid', 'commit', '-m', 'fixture base']);
  const baseSha = await fixtureGit(repoPath, ['rev-parse', 'HEAD']);
  assert.match(baseSha, /^[0-9a-f]{40}$/);
  return { root, repoPath, worktreeRoot, stateRoot, outsideRoot, baseSha, origin };
}

export async function addFixtureCommit(repoPath, relativePath = 'SECOND.md') {
  await writeFile(join(repoPath, relativePath), 'second controlled fixture\n', 'utf8');
  await fixtureGit(repoPath, ['add', relativePath]);
  await fixtureGit(repoPath, ['-c', 'user.name=Pilot Test', '-c', 'user.email=pilot@example.invalid', 'commit', '-m', 'fixture second']);
  return fixtureGit(repoPath, ['rev-parse', 'HEAD']);
}

export async function createLocalCloneFixture(t, sourceRepository) {
  const root = await mkdtemp(join(tmpdir(), 'athleta-pilot-clone-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoPath = join(root, 'repo');
  const worktreeRoot = join(root, 'worktrees');
  const stateRoot = join(root, 'state');
  const outsideRoot = join(root, 'outside');
  await execFileAsync('/usr/bin/git', ['clone', '--local', '--no-hardlinks', sourceRepository, repoPath], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
  });
  await fixtureGit(repoPath, ['remote', 'set-url', 'origin', FIXTURE_ORIGIN]);
  await Promise.all([mkdir(worktreeRoot), mkdir(stateRoot), mkdir(outsideRoot)]);
  const baseSha = await fixtureGit(repoPath, ['rev-parse', 'HEAD']);
  return { root, repoPath, worktreeRoot, stateRoot, outsideRoot, baseSha, origin: FIXTURE_ORIGIN };
}

export async function createRunnerFixture(t, repository, overrides = {}) {
  const runnerRoot = join(repository.root, `runner-${Math.random().toString(16).slice(2)}`);
  await cp(sourceRunnerRoot, runnerRoot, { recursive: true });
  const config = {
    schemaVersion: 1,
    repository: {
      root: repository.repoPath,
      origin: repository.origin,
      approvedBaseSha: repository.baseSha,
      ...(overrides.repository ?? {}),
    },
    runtime: {
      node: process.version.replace(/^v/, ''),
      pnpm: '11.4.0',
      ...(overrides.runtime ?? {}),
    },
    tools: {
      codexExecutable: '/home/rcoirini/.nvm/versions/node/v22.23.0/bin/codex',
      ...(overrides.tools ?? {}),
    },
    paths: {
      stateRoot: repository.stateRoot,
      worktreeRoot: repository.worktreeRoot,
      productPdf: 'README.md',
      pipelinePdf: 'README.md',
      ...(overrides.paths ?? {}),
    },
    ...(overrides.root ?? {}),
  };
  await writeFile(join(runnerRoot, 'config', 'pilot-v1.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return {
    runnerRoot,
    config,
    importModule(relativePath) {
      return import(pathToFileURL(join(runnerRoot, relativePath)).href);
    },
  };
}
