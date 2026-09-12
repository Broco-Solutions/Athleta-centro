import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as processApi from '../lib/process.mjs';
import { runArgumentEchoFixture, runProcessTreeFixture } from './support/process-fixtures.mjs';

test('production process exports contain no executor, operation selector, or test fixture', () => {
  for (const forbidden of [
    'runTechnicalOperation',
    'runBootstrapOperation',
    'TECHNICAL_OPERATIONS',
    'BOOTSTRAP_OPERATIONS',
    'runProcessTreeTestFixture',
    'runArgumentEchoTest',
  ]) assert.equal(forbidden in processApi, false, forbidden);
  assert.throws(
    () => processApi.probeGitVersion({ cwd: '/tmp', executable: '/bin/sh', argv: ['-c', 'id'] }),
    (error) => error instanceof processApi.ProcessExecutionError && error.reasonCode === 'INVALID_PROBE_ARGUMENTS',
  );
});

test('test-only fixture preserves arguments without shell interpretation', async () => {
  const values = ['plain value', 'semi;colon', '$(not-a-command)', 'quote"value'];
  const result = await runArgumentEchoFixture(values);
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), values);
});

test('fixed Git probe ignores a substituted PATH', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-process-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'fake-git-ran');
  const fakeGit = join(root, 'git');
  await writeFile(fakeGit, `#!/bin/sh\ntouch '${marker}'\n`, 'utf8');
  await chmod(fakeGit, 0o700);
  const originalPath = process.env.PATH;
  process.env.PATH = root;
  t.after(() => { process.env.PATH = originalPath; });
  const result = await processApi.probeGitVersion();
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^git version /);
  await assert.rejects(access(marker), { code: 'ENOENT' });
});

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return text.slice(text.lastIndexOf(')') + 2).split(/\s+/)[0] !== 'Z';
  } catch (error) {
    if (error?.code === 'ESRCH' || error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function waitUntilStopped(pid) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && processIsRunning(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(processIsRunning(pid), false, `process ${pid} survived timeout`);
}

test('timeout terminates a real fixture parent and descendant process group', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-process-tree-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pidFile = join(root, 'pids.json');
  const result = await runProcessTreeFixture(pidFile);
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
  const { parentPid, childPid } = JSON.parse(await readFile(pidFile, 'utf8'));
  await Promise.all([waitUntilStopped(parentPid), waitUntilStopped(childPid)]);
});

test('environment allowlist excludes secrets and fixes PATH', () => {
  const result = processApi.buildAllowlistedEnv({
    sourceEnv: { PATH: '/untrusted', SAFE_VALUE: 'visible', GH_TOKEN: 'synthetic-secret' },
    allowlist: ['PATH', 'SAFE_VALUE'],
  });
  assert.equal(result.SAFE_VALUE, 'visible');
  assert.notEqual(result.PATH, '/untrusted');
  assert.equal('GH_TOKEN' in result, false);
  assert.equal('HOME' in result, false);
  for (const name of ['TOKEN', 'secret_value', 'Password', 'API_KEY', 'apiKey', 'credentials', 'auth', 'PRIVATE_KEY', 'OPENAI_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'DATABASE_URL', 'AWS_PROFILE', 'S3_BUCKET', 'COOKIE', 'SESSION_ID']) {
    assert.equal(processApi.isSecretEnvironmentName(name), true, name);
    assert.throws(
      () => processApi.buildAllowlistedEnv({ sourceEnv: { [name]: 'value' }, allowlist: [name] }),
      (error) => error instanceof processApi.ProcessExecutionError && error.reasonCode === 'SECRET_ENV_FORBIDDEN',
    );
  }
});

test('sanitizes aliases, authorization, credential URLs, and private keys', () => {
  const secrets = ['bearer-value', 'basic-value', 'api-key-value', 'credentials-value', 'auth-value', 'private-key-material', 'db-password'];
  const output = processApi.sanitizeText([
    'Authorization: Bearer bearer-value',
    'Authorization: Basic basic-value',
    'apiKey="api-key-value" credentials=credentials-value auth:auth-value',
    'DATABASE_URL=https://user:db-password@example.invalid/db',
    '-----BEGIN PRIVATE KEY-----',
    'private-key-material',
    '-----END PRIVATE KEY-----',
  ].join('\n'));
  for (const secret of secrets) assert.equal(output.includes(secret), false, secret);
  assert.match(output, /\[REDACTED/);
});
