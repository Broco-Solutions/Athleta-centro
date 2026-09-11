import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildAllowlistedEnv,
  ProcessExecutionError,
  runProcess,
  sanitizeText,
} from '../lib/process.mjs';

test('preserves process arguments as an array', async () => {
  const values = ['plain value', 'semi;colon', '$(not-a-command)', 'quote"value'];
  const result = await runProcess(
    process.execPath,
    ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...values],
    { timeoutMs: 5_000 },
  );
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), values);
});

test('does not execute shell metacharacters', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-process-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'should-not-exist');
  const payload = `; touch ${marker}`;
  const result = await runProcess(
    process.execPath,
    ['-e', 'console.log(process.argv[1])', payload],
    { timeoutMs: 5_000 },
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), payload);
  await assert.rejects(access(marker), { code: 'ENOENT' });
});

test('terminates a process after the explicit timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
    timeoutMs: 50,
  });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
});

test('inherits only allowlisted environment names', async () => {
  const result = await runProcess(
    process.execPath,
    ['-e', 'console.log(JSON.stringify({safe:process.env.SAFE_VALUE,token:process.env.GH_TOKEN}))'],
    {
      timeoutMs: 5_000,
      sourceEnv: { PATH: process.env.PATH, SAFE_VALUE: 'visible', GH_TOKEN: 'synthetic-secret' },
      allowedEnv: ['PATH', 'SAFE_VALUE'],
    },
  );
  assert.deepEqual(JSON.parse(result.stdout), { safe: 'visible' });
  assert.deepEqual(
    buildAllowlistedEnv({ sourceEnv: { SAFE: 'yes', GH_TOKEN: 'no' }, allowlist: ['SAFE'] }),
    { SAFE: 'yes' },
  );
  assert.throws(
    () => buildAllowlistedEnv({ allowlist: ['SAFE'], overrides: { GH_TOKEN: 'no' } }),
    (error) => error instanceof ProcessExecutionError && error.reasonCode === 'ENV_NOT_ALLOWLISTED',
  );
});

test('sanitizes common credential forms', () => {
  const output = sanitizeText(
    'GH_TOKEN=synthetic-value DATABASE_URL=postgres://user:pass@host/db Authorization: Bearer abc123',
  );
  assert.equal(output.includes('synthetic-value'), false);
  assert.equal(output.includes('user:pass'), false);
  assert.equal(output.includes('abc123'), false);
  assert.match(output, /\[REDACTED\]/);
});
