import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { StateStore, StateStoreError } from '../lib/state.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'athleta-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore({ root });
  await store.prepare();
  await store.initialize('run-1');
  return { root, store };
}

test('writes, reads and atomically replaces state', async (t) => {
  const { store } = await fixture(t);
  const state = await store.read('run-1');
  state.status = 'RUNNING';
  await store.write('run-1', state);
  assert.equal((await store.read('run-1')).status, 'RUNNING');
  const names = await readdir(store.runDirectory('run-1'));
  assert.equal(names.some((name) => name.endsWith('.tmp')), false);
});

test('allows only one exclusive lock per run', async (t) => {
  const { store } = await fixture(t);
  const release = await store.acquireLock('run-1');
  await assert.rejects(
    store.acquireLock('run-1'),
    (error) => error instanceof StateStoreError && error.reasonCode === 'RUN_LOCKED',
  );
  await release();
  const releaseAgain = await store.acquireLock('run-1');
  await releaseAgain();
});

test('resumes planned operations and confirms them idempotently', async (t) => {
  const { store } = await fixture(t);
  await store.planOperation('run-1', 'future-push', { target: 'not-executed' });
  assert.deepEqual((await store.resume('run-1')).pendingOperations, ['future-push']);
  await store.confirmOperation('run-1', 'future-push', { ok: true });
  await store.confirmOperation('run-1', 'future-push', { ignored: true });
  const resumed = await store.resume('run-1');
  assert.deepEqual(resumed.pendingOperations, []);
  assert.equal(resumed.state.operations['future-push'].status, 'confirmed');
  assert.equal(resumed.journal.length, 2);
});

test('ignores abandoned temporary state and an interrupted last journal line', async (t) => {
  const { store } = await fixture(t);
  await writeFile(`${store.statePath('run-1')}.interrupted.tmp`, '{"bad":', 'utf8');
  await store.recordEvent('run-1', 'SAFE_EVENT');
  await appendFile(store.journalPath('run-1'), '{"interrupted":', 'utf8');
  assert.equal((await store.read('run-1')).runId, 'run-1');
  assert.equal((await store.readJournal('run-1')).length, 1);
});

test('sanitizes secrets before persistence', async (t) => {
  const { store } = await fixture(t);
  const state = await store.read('run-1');
  state.password = 'synthetic-password';
  state.details = 'GH_TOKEN=synthetic-token';
  state.clinicalBody = 'unnecessary synthetic clinical text';
  await store.write('run-1', state);
  const persisted = await readFile(store.statePath('run-1'), 'utf8');
  assert.equal(persisted.includes('synthetic-password'), false);
  assert.equal(persisted.includes('synthetic-token'), false);
  assert.equal(persisted.includes('unnecessary synthetic clinical text'), false);
  assert.match(persisted, /\[REDACTED\]/);
});
