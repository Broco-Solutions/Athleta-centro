import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  sanitizeForPersistence,
  STATE_DURABLE_AUTHORITY,
  StateStore,
  StateStoreError,
} from '../lib/state.mjs';

async function fixture(t, runId = 'run-1') {
  const root = await mkdtemp(join(tmpdir(), 'athleta-state-'));
  const store = new StateStore({ root });
  await store.prepare();
  const lock = await store.acquireLock(runId);
  t.after(async () => {
    await lock.release();
    await rm(root, { recursive: true, force: true });
  });
  await store.initialize(runId, lock);
  return { root, runId, store, lock };
}

test('writes a closed status update atomically while holding the run lock', async (t) => {
  const { store, lock, runId } = await fixture(t);
  const state = await store.read(runId);
  state.status = 'RUNNING';
  await store.write(runId, lock, state);
  const persisted = await store.read(runId);
  assert.equal(persisted.status, 'RUNNING');
  assert.equal(persisted.lastEvent.type, 'RUN_STATUS_CHANGED');
  assert.match(STATE_DURABLE_AUTHORITY, /state\.json is authoritative/);
  const names = await readdir(store.runDirectory(runId));
  assert.equal(names.some((name) => name.endsWith('.tmp')), false);
});

test('all durable state mutations reject missing or foreign lock ownership', async (t) => {
  const { root, store, lock, runId } = await fixture(t);
  const otherStore = new StateStore({ root });
  const state = await store.read(runId);
  state.status = 'BUILD';
  const mutations = [
    () => store.initialize('new-run', undefined),
    () => store.write(runId, undefined, state),
    () => store.recordEvent(runId, undefined, 'RUN_NOTE', { message: 'safe note' }),
    () => store.planOperation(runId, undefined, 'future-effect'),
    () => store.confirmOperation(runId, undefined, 'future-effect'),
    () => store.resume(runId, undefined),
    () => otherStore.write(runId, lock, state),
  ];
  for (const mutate of mutations) {
    await assert.rejects(
      mutate(),
      (error) =>
        error instanceof StateStoreError && error.reasonCode === 'LOCK_OWNERSHIP_REQUIRED',
    );
  }
});

test('a second writer is rejected and basic concurrent acquisition has one winner', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-state-concurrent-'));
  const first = new StateStore({ root });
  const second = new StateStore({ root });
  await Promise.all([first.prepare(), second.prepare()]);
  const results = await Promise.allSettled([
    first.acquireLock('concurrent-run'),
    second.acquireLock('concurrent-run'),
  ]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.reasonCode, 'RUN_LOCKED');
  await fulfilled[0].value.release();
  await rm(root, { recursive: true, force: true });
});

test('provably orphaned lock is recoverable and preserved for inspection', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'athleta-state-orphan-'));
  const store = new StateStore({ root });
  await store.prepare();
  const original = await store.acquireLock('orphan-run');
  const metadata = JSON.parse(await readFile(store.lockPath('orphan-run'), 'utf8'));
  await original.release();
  metadata.ownerId = 'provably-orphaned-owner';
  metadata.pid = 99_999_999;
  metadata.acquiredAt = '1970-01-01T00:00:00.000Z';
  await writeFile(store.lockPath('orphan-run'), `${JSON.stringify(metadata)}\n`, 'utf8');

  const recovered = await store.acquireLock('orphan-run');
  t.after(async () => {
    await recovered.release();
    await rm(root, { recursive: true, force: true });
  });
  const names = await readdir(store.runDirectory('orphan-run'));
  assert.equal(names.some((name) => name.startsWith('run.lock.orphaned.')), true);
});

test('active lock is not stolen merely because its timestamp is old', async (t) => {
  const { root, store, lock, runId } = await fixture(t);
  const metadata = JSON.parse(await readFile(store.lockPath(runId), 'utf8'));
  metadata.acquiredAt = '1970-01-01T00:00:00.000Z';
  await writeFile(store.lockPath(runId), `${JSON.stringify(metadata)}\n`, 'utf8');
  const contender = new StateStore({ root });
  await assert.rejects(
    contender.acquireLock(runId),
    (error) => error instanceof StateStoreError && error.reasonCode === 'RUN_LOCKED',
  );
  await store.recordEvent(runId, lock, 'RUN_NOTE', { message: 'owner remains valid' });
});

test('partial journal tail is detected, durably truncated on reopen, then safely appended', async (t) => {
  const { root, store, lock, runId } = await fixture(t);
  await store.recordEvent(runId, lock, 'RUN_NOTE', { message: 'first complete event' });
  await appendFile(store.journalPath(runId), '{"interrupted":', 'utf8');
  await assert.rejects(
    store.readJournal(runId),
    (error) => error instanceof StateStoreError && error.reasonCode === 'JOURNAL_PARTIAL_TAIL',
  );
  await lock.release();

  const reopened = new StateStore({ root });
  const reopenedLock = await reopened.acquireLock(runId);
  await reopened.recordEvent(runId, reopenedLock, 'RUN_NOTE', { message: 'second complete event' });
  const journal = await reopened.readJournal(runId);
  assert.equal(journal.length, 2);
  assert.deepEqual(journal.map((event) => event.sequence), [1, 2]);
  const text = await readFile(reopened.journalPath(runId), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.includes('interrupted'), false);
  for (const line of text.trimEnd().split('\n')) assert.doesNotThrow(() => JSON.parse(line));
  await reopenedLock.release();
});

test('planned non-idempotent operation becomes outcome_unknown after crash-style reopen', async (t) => {
  const { root, store, lock, runId } = await fixture(t);
  await store.planOperation(runId, lock, 'future-push');
  await lock.release();

  const reopened = new StateStore({ root });
  const reopenedLock = await reopened.acquireLock(runId);
  const resumed = await reopened.resume(runId, reopenedLock);
  assert.deepEqual(resumed.pendingOperations, []);
  assert.deepEqual(resumed.retryableOperations, []);
  assert.deepEqual(resumed.outcomeUnknownOperations, ['future-push']);
  assert.equal(resumed.reconciliationRequired, true);
  assert.equal(resumed.state.operations['future-push'].status, 'outcome_unknown');
  await assert.rejects(
    reopened.confirmOperation(runId, reopenedLock, 'future-push'),
    (error) =>
      error instanceof StateStoreError && error.reasonCode === 'RECONCILIATION_REQUIRED',
  );
  assert.equal((await reopened.planOperation(runId, reopenedLock, 'future-push')).status, 'outcome_unknown');
  await reopenedLock.release();
});

test('confirmed operation remains confirmed and is not duplicated on resume', async (t) => {
  const { store, lock, runId } = await fixture(t);
  await store.planOperation(runId, lock, 'controlled-effect');
  await store.confirmOperation(runId, lock, 'controlled-effect');
  const resumed = await store.resume(runId, lock);
  assert.equal(resumed.reconciliationRequired, false);
  assert.deepEqual(resumed.outcomeUnknownOperations, []);
  assert.equal(resumed.state.operations['controlled-effect'].status, 'confirmed');
  assert.equal(resumed.journal.length, 2);
});

test('closed persisted schema rejects unknown secret-bearing fields', async (t) => {
  const { store, lock, runId } = await fixture(t);
  const state = await store.read(runId);
  state.apiKey = 'synthetic-api-key';
  await assert.rejects(
    store.write(runId, lock, state),
    (error) =>
      error instanceof StateStoreError && error.reasonCode === 'INVALID_PERSISTED_SHAPE',
  );
  const persisted = await readFile(store.statePath(runId), 'utf8');
  assert.equal(persisted.includes('synthetic-api-key'), false);
});

test('defensive sanitizer covers objects, arrays, nested aliases, auth, and private keys', async (t) => {
  const { store, lock, runId } = await fixture(t);
  const secretValues = [
    'object-token',
    'array-secret',
    'nested-credential',
    'auth-value',
    'basic-value',
    'bearer-value',
    'private-key-material',
  ];
  const sanitized = sanitizeForPersistence({
    token: 'object-token',
    values: [{ apiKey: 'array-secret' }, { nested: { credentials: 'nested-credential' } }],
    auth: 'auth-value',
  });
  assert.deepEqual(sanitized, {
    token: '[REDACTED]',
    values: [{ apiKey: '[REDACTED]' }, { nested: { credentials: '[REDACTED]' } }],
    auth: '[REDACTED]',
  });

  await store.recordEvent(runId, lock, 'RUN_NOTE', {
    message: [
      'Authorization: Basic basic-value',
      'Authorization: Bearer bearer-value',
      '-----BEGIN PRIVATE KEY-----',
      'private-key-material',
      '-----END PRIVATE KEY-----',
    ].join('\n'),
  });
  const persisted = `${await readFile(store.statePath(runId), 'utf8')}\n${await readFile(
    store.journalPath(runId),
    'utf8',
  )}`;
  for (const value of secretValues) assert.equal(persisted.includes(value), false, value);
  assert.match(persisted, /\[REDACTED/);
});
