import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildAllowlistedEnv,
  isSecretEnvironmentName,
  ProcessExecutionError,
  runArgumentEchoTest,
  runProcessTreeTestFixture,
  runTechnicalOperation,
  sanitizeText,
  TECHNICAL_OPERATIONS,
} from '../lib/process.mjs';

test('preserves controlled process arguments as an array without shell interpretation', async () => {
  const values = ['plain value', 'semi;colon', '$(not-a-command)', 'quote"value'];
  const result = await runArgumentEchoTest(values, { timeoutMs: 5_000 });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), values);
});

test('public process API rejects shells, interpreters, arbitrary executables, and structural flags', async () => {
  for (const operation of ['/bin/sh', 'bash', 'node', 'node.script', 'arbitrary-executable']) {
    await assert.rejects(
      runTechnicalOperation(operation, {}),
      (error) => error instanceof ProcessExecutionError && error.reasonCode === 'OPERATION_NOT_ALLOWED',
    );
  }
  await assert.rejects(
    runTechnicalOperation(TECHNICAL_OPERATIONS.NODE_VERSION, {
      executable: '/bin/sh',
      shell: true,
      args: ['-c', 'exit 0'],
    }),
    (error) =>
      error instanceof ProcessExecutionError && error.reasonCode === 'INVALID_OPERATION_PARAMETERS',
  );
  await assert.rejects(
    runTechnicalOperation(TECHNICAL_OPERATIONS.NODE_VERSION, {}, {
      shell: true,
      env: { NODE_OPTIONS: '--require=/tmp/payload.cjs' },
    }),
    (error) =>
      error instanceof ProcessExecutionError && error.reasonCode === 'INVALID_EXECUTION_OPTIONS',
  );
  await assert.rejects(
    runTechnicalOperation(TECHNICAL_OPERATIONS.GIT_ORIGIN, {
      repoPath: '/tmp',
      executable: '/bin/sh',
    }),
    (error) =>
      error instanceof ProcessExecutionError && error.reasonCode === 'INVALID_OPERATION_PARAMETERS',
  );
  await assert.rejects(
    runTechnicalOperation(TECHNICAL_OPERATIONS.GIT_REV_PARSE, {
      repoPath: '/tmp',
      ref: '--upload-pack=/tmp/payload',
    }),
    (error) =>
      error instanceof ProcessExecutionError && error.reasonCode === 'INVALID_OPERATION_PARAMETERS',
  );
});

test('does not resolve a trusted executable through a substituted PATH', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-process-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'fake-git-ran');
  const fakeGit = join(root, 'git');
  await writeFile(fakeGit, `#!/bin/sh\ntouch '${marker}'\n`, 'utf8');
  await chmod(fakeGit, 0o700);

  const result = await runTechnicalOperation(
    TECHNICAL_OPERATIONS.GIT_VERSION,
    {},
    { sourceEnv: { PATH: root }, timeoutMs: 5_000 },
  );
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^git version /);
  await assert.rejects(access(marker), { code: 'ENOENT' });
});

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    const stat = requireProcessStat(pid);
    return stat !== null && stat !== 'Z';
  } catch (error) {
    if (error?.code === 'ESRCH' || error?.code === 'ENOENT') return false;
    throw error;
  }
}

function requireProcessStat(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return text.slice(text.lastIndexOf(')') + 2).split(/\s+/)[0];
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
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

test('timeout terminates the dedicated process group including a real descendant', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-process-tree-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pidFile = join(root, 'pids.json');
  const result = await runProcessTreeTestFixture(pidFile, { timeoutMs: 200 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
  const { parentPid, childPid } = JSON.parse(await readFile(pidFile, 'utf8'));
  await Promise.all([waitUntilStopped(parentPid), waitUntilStopped(childPid)]);
});

test('inherits only non-secret allowlisted environment names and fixes PATH', () => {
  const result = buildAllowlistedEnv({
    sourceEnv: { PATH: '/untrusted', SAFE_VALUE: 'visible', GH_TOKEN: 'synthetic-secret' },
    allowlist: ['PATH', 'SAFE_VALUE'],
  });
  assert.equal(result.SAFE_VALUE, 'visible');
  assert.notEqual(result.PATH, '/untrusted');
  assert.equal('GH_TOKEN' in result, false);
  assert.equal('HOME' in result, false);
  assert.equal('TMPDIR' in result, false);

  for (const name of [
    'TOKEN',
    'secret_value',
    'Password',
    'API_KEY',
    'apiKey',
    'credentials',
    'auth',
    'PRIVATE_KEY',
    'OPENAI_API_KEY',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'DATABASE_URL',
    'AWS_PROFILE',
    'S3_BUCKET',
    'COOKIE',
    'SESSION_ID',
  ]) {
    assert.equal(isSecretEnvironmentName(name), true, name);
    assert.throws(
      () => buildAllowlistedEnv({ sourceEnv: { [name]: 'value' }, allowlist: [name] }),
      (error) =>
        error instanceof ProcessExecutionError && error.reasonCode === 'SECRET_ENV_FORBIDDEN',
    );
  }
});

test('sanitizes common aliases, bearer/basic auth, URLs, and private keys', () => {
  const secrets = [
    'bearer-value',
    'basic-value',
    'api-key-value',
    'credentials-value',
    'auth-value',
    'private-key-material',
    'db-password',
  ];
  const output = sanitizeText([
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
