import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizeText } from './process.mjs';

export const DEFAULT_STATE_ROOT = '/home/rcoirini/.local/state/athleta/pilot-runner';
export const STATE_DURABLE_AUTHORITY =
  'state.json is authoritative; journal.ndjson is a recoverable audit projection.';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATE_STATUSES = new Set([
  'BACKLOG',
  'READY',
  'ANALYSIS',
  'BUILD',
  'REVIEW',
  'QA',
  'FIX_REQUIRED',
  'DECISION_REQUIRED',
  'DRAFT_PR',
  'HUMAN_PRODUCT_GATE',
  'PARKED',
  'DONE',
  'BLOCKED_GLOBAL',
  'RUNNING',
]);
const STATE_KEYS = new Set([
  'schemaVersion',
  'runId',
  'status',
  'lastEventSequence',
  'operations',
  'lastEvent',
]);
const OPERATION_KEYS = new Set([
  'status',
  'effect',
  'plannedAt',
  'confirmedAt',
  'outcomeUnknownAt',
]);
const EVENT_KEYS = new Set(['schemaVersion', 'sequence', 'type', 'at', 'data']);
const EVENT_TYPES = new Set([
  'RUN_NOTE',
  'RUN_STATUS_CHANGED',
  'OPERATION_PLANNED',
  'OPERATION_CONFIRMED',
  'OPERATION_OUTCOME_UNKNOWN',
]);
const LOCK_KEYS = new Set([
  'schemaVersion',
  'ownerId',
  'pid',
  'hostname',
  'bootId',
  'processStartTicks',
  'acquiredAt',
]);
const lockRecords = new WeakMap();

export class StateStoreError extends Error {
  constructor(message, reasonCode, details = {}) {
    super(message);
    this.name = 'StateStoreError';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

function assertSafeName(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value) || value === '.' || value === '..') {
    throw new StateStoreError(`Invalid ${label}`, 'INVALID_STATE_IDENTIFIER', { label });
  }
  return value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedSensitiveKey(key) {
  return String(key).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isSensitiveKey(key) {
  const normalized = normalizedSensitiveKey(key);
  return (
    [
      'PASSWORD',
      'PASSPHRASE',
      'PIN',
      'TOKEN',
      'SECRET',
      'APIKEY',
      'CREDENTIAL',
      'AUTH',
      'PRIVATEKEY',
      'DATABASEURL',
      'COOKIE',
      'SESSION',
      'CLINICALBODY',
      'CLINICALCONTENT',
      'CLINICALHISTORY',
      'CLINICALNOTE',
    ].some((marker) => normalized.includes(marker)) ||
    normalized.startsWith('AWS') ||
    normalized.startsWith('S3') ||
    normalized.startsWith('OPENAI')
  );
}

export function sanitizeForPersistence(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new StateStoreError('State contains a non-JSON value', 'INVALID_STATE_VALUE');
  }
  if (seen.has(value)) throw new StateStoreError('State contains a cycle', 'INVALID_STATE_VALUE');
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((entry) => sanitizeForPersistence(entry, seen));
    seen.delete(value);
    return result;
  }
  if (!isPlainObject(value)) {
    throw new StateStoreError('State must contain plain JSON objects', 'INVALID_STATE_VALUE');
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeForPersistence(entry, seen);
  }
  seen.delete(value);
  return result;
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) {
    throw new StateStoreError(`${label} must be an object`, 'INVALID_PERSISTED_SHAPE');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new StateStoreError(`${label} contains unknown field: ${key}`, 'INVALID_PERSISTED_SHAPE', {
        key,
      });
    }
  }
}

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new StateStoreError(`${label} must be an ISO timestamp`, 'INVALID_PERSISTED_SHAPE');
  }
}

function validateOperation(operation) {
  assertExactKeys(operation, OPERATION_KEYS, 'operation');
  if (!['planned', 'confirmed', 'outcome_unknown'].includes(operation.status)) {
    throw new StateStoreError('Operation status is invalid', 'INVALID_PERSISTED_SHAPE');
  }
  if (operation.effect !== 'non-idempotent') {
    throw new StateStoreError('Operation effect is invalid', 'INVALID_PERSISTED_SHAPE');
  }
  assertIsoDate(operation.plannedAt, 'operation.plannedAt');
  if (operation.status === 'confirmed') assertIsoDate(operation.confirmedAt, 'operation.confirmedAt');
  if (operation.status === 'outcome_unknown') {
    assertIsoDate(operation.outcomeUnknownAt, 'operation.outcomeUnknownAt');
  }
}

function validateEventData(type, data) {
  if (type === 'RUN_NOTE') {
    assertExactKeys(data, new Set(['message']), 'event.data');
    if (typeof data.message !== 'string' || data.message.length === 0) {
      throw new StateStoreError('RUN_NOTE requires a message', 'INVALID_PERSISTED_SHAPE');
    }
    return;
  }
  if (type === 'RUN_STATUS_CHANGED') {
    assertExactKeys(data, new Set(['status']), 'event.data');
    if (!STATE_STATUSES.has(data.status)) {
      throw new StateStoreError('Event status is invalid', 'INVALID_PERSISTED_SHAPE');
    }
    return;
  }
  assertExactKeys(data, new Set(['operationId']), 'event.data');
  assertSafeName(data.operationId, OPERATION_ID_PATTERN, 'operation id');
}

function validateEvent(event) {
  assertExactKeys(event, EVENT_KEYS, 'event');
  if (event.schemaVersion !== 1 || !Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new StateStoreError('Event identity is invalid', 'INVALID_PERSISTED_SHAPE');
  }
  if (!EVENT_TYPES.has(event.type)) {
    throw new StateStoreError('Event type is not persistible', 'INVALID_PERSISTED_SHAPE');
  }
  assertIsoDate(event.at, 'event.at');
  validateEventData(event.type, event.data);
  return event;
}

function validateState(state, runId) {
  assertExactKeys(state, STATE_KEYS, 'state');
  if (
    state.schemaVersion !== 1 ||
    state.runId !== runId ||
    !STATE_STATUSES.has(state.status) ||
    !Number.isSafeInteger(state.lastEventSequence) ||
    state.lastEventSequence < 0
  ) {
    throw new StateStoreError('State identity or schema does not match', 'INVALID_STATE');
  }
  if (!isPlainObject(state.operations)) {
    throw new StateStoreError('State operations must be an object', 'INVALID_PERSISTED_SHAPE');
  }
  for (const [operationId, operation] of Object.entries(state.operations)) {
    assertSafeName(operationId, OPERATION_ID_PATTERN, 'operation id');
    validateOperation(operation);
  }
  if (state.lastEventSequence === 0 && state.lastEvent !== undefined) {
    throw new StateStoreError('Initial state cannot have a last event', 'INVALID_PERSISTED_SHAPE');
  }
  if (state.lastEventSequence > 0) {
    validateEvent(state.lastEvent);
    if (state.lastEvent.sequence !== state.lastEventSequence) {
      throw new StateStoreError('Last event sequence differs from state', 'INVALID_PERSISTED_SHAPE');
    }
  }
  return state;
}

async function bestEffortChmod(path, mode) {
  try {
    await chmod(path, mode);
  } catch (error) {
    if (!['ENOSYS', 'EPERM', 'EINVAL'].includes(error?.code)) throw error;
  }
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await bestEffortChmod(path, 0o700);
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function atomicWriteJson(path, value) {
  await ensurePrivateDirectory(dirname(path));
  const sanitized = sanitizeForPersistence(value);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
    await bestEffortChmod(path, 0o600);
    await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function initialState(runId, initial) {
  assertExactKeys(initial, new Set(['status']), 'initial state');
  const status = initial.status ?? 'READY';
  if (!STATE_STATUSES.has(status)) {
    throw new StateStoreError('Initial status is invalid', 'INVALID_STATE');
  }
  return {
    schemaVersion: 1,
    runId,
    status,
    lastEventSequence: 0,
    operations: {},
  };
}

async function linuxBootId() {
  return (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
}

async function processStartTicks(pid) {
  const text = await readFile(`/proc/${pid}/stat`, 'utf8');
  const afterCommand = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  const startTicks = afterCommand[19];
  if (!startTicks || !/^[0-9]+$/.test(startTicks)) {
    throw new StateStoreError('Could not establish process identity', 'LOCK_IDENTITY_UNKNOWN');
  }
  return startTicks;
}

function parseLockMetadata(text) {
  let metadata;
  try {
    metadata = JSON.parse(text);
  } catch {
    throw new StateStoreError('Existing lock metadata is invalid', 'RUN_LOCKED');
  }
  try {
    assertExactKeys(metadata, LOCK_KEYS, 'lock');
    if (
      metadata.schemaVersion !== 1 ||
      typeof metadata.ownerId !== 'string' ||
      !Number.isSafeInteger(metadata.pid) ||
      metadata.pid < 1 ||
      typeof metadata.hostname !== 'string' ||
      typeof metadata.bootId !== 'string' ||
      typeof metadata.processStartTicks !== 'string'
    ) {
      throw new Error('invalid lock metadata');
    }
    assertIsoDate(metadata.acquiredAt, 'lock.acquiredAt');
    return metadata;
  } catch (error) {
    if (error instanceof StateStoreError && error.reasonCode === 'RUN_LOCKED') throw error;
    throw new StateStoreError('Existing lock metadata is invalid', 'RUN_LOCKED');
  }
}

async function lockIsProvablyOrphaned(metadata) {
  if (metadata.hostname !== hostname()) return false;
  const currentBootId = await linuxBootId().catch(() => null);
  if (!currentBootId) return false;
  if (metadata.bootId !== currentBootId) return true;
  try {
    return (await processStartTicks(metadata.pid)) !== metadata.processStartTicks;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    return false;
  }
}

function parseJournalLines(text, runId, { allowPartialTail = false } = {}) {
  if (text.length === 0) return [];
  if (!text.endsWith('\n') && !allowPartialTail) {
    throw new StateStoreError('Journal has a partial tail', 'JOURNAL_PARTIAL_TAIL', { runId });
  }
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (allowPartialTail && !text.endsWith('\n')) lines.pop();
  const events = [];
  for (const [index, line] of lines.entries()) {
    try {
      const event = JSON.parse(line);
      validateEvent(event);
      if (event.sequence !== index + 1) throw new Error('sequence gap');
      events.push(event);
    } catch {
      throw new StateStoreError('Journal is corrupt', 'JOURNAL_CORRUPT', {
        runId,
        line: index + 1,
      });
    }
  }
  return events;
}

export class StateStore {
  constructor({ root = DEFAULT_STATE_ROOT } = {}) {
    this.root = root;
  }

  runDirectory(runId) {
    assertSafeName(runId, RUN_ID_PATTERN, 'run id');
    return join(this.root, 'runs', runId);
  }

  statePath(runId) {
    return join(this.runDirectory(runId), 'state.json');
  }

  journalPath(runId) {
    return join(this.runDirectory(runId), 'journal.ndjson');
  }

  lockPath(runId) {
    return join(this.runDirectory(runId), 'run.lock');
  }

  recoveryPath(runId) {
    return join(this.runDirectory(runId), 'lock.recovery');
  }

  async prepare() {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(join(this.root, 'runs'));
    await access(this.root, fsConstants.R_OK | fsConstants.W_OK);
  }

  async #writeNewLock(runId) {
    const path = this.lockPath(runId);
    const ownerId = randomUUID();
    const metadata = {
      schemaVersion: 1,
      ownerId,
      pid: process.pid,
      hostname: hostname(),
      bootId: await linuxBootId(),
      processStartTicks: await processStartTicks(process.pid),
      acquiredAt: new Date().toISOString(),
    };
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => {});
      await unlink(path).catch(() => {});
      throw error;
    }
    await syncDirectory(this.runDirectory(runId));
    const token = Object.freeze({
      runId,
      ownerId,
      release: () => this.releaseLock(token),
    });
    lockRecords.set(token, { store: this, runId, ownerId, handle, released: false });
    return token;
  }

  async #recoverOrRejectLock(runId) {
    const recoveryPath = this.recoveryPath(runId);
    try {
      await mkdir(recoveryPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new StateStoreError(`Run is already locked: ${runId}`, 'RUN_LOCKED', { runId });
      }
      throw error;
    }
    try {
      let metadata;
      try {
        metadata = parseLockMetadata(await readFile(this.lockPath(runId), 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
      if (!(await lockIsProvablyOrphaned(metadata))) {
        throw new StateStoreError(`Run is already locked: ${runId}`, 'RUN_LOCKED', { runId });
      }
      const orphanPath = join(
        this.runDirectory(runId),
        `run.lock.orphaned.${Date.now()}.${randomUUID()}`,
      );
      await rename(this.lockPath(runId), orphanPath);
      await syncDirectory(this.runDirectory(runId));
    } finally {
      await rmdir(recoveryPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }

  async acquireLock(runId) {
    const directory = this.runDirectory(runId);
    await ensurePrivateDirectory(directory);
    try {
      return await this.#writeNewLock(runId);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    await this.#recoverOrRejectLock(runId);
    try {
      return await this.#writeNewLock(runId);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new StateStoreError(`Run is already locked: ${runId}`, 'RUN_LOCKED', { runId });
      }
      throw error;
    }
  }

  async #assertLock(runId, token) {
    const record = token && lockRecords.get(token);
    if (
      !record ||
      record.store !== this ||
      record.runId !== runId ||
      record.released ||
      token.ownerId !== record.ownerId
    ) {
      throw new StateStoreError('Valid run lock ownership is required', 'LOCK_OWNERSHIP_REQUIRED', {
        runId,
      });
    }
    let metadata;
    try {
      metadata = parseLockMetadata(await readFile(this.lockPath(runId), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new StateStoreError('Run lock ownership was lost', 'LOCK_OWNERSHIP_LOST', { runId });
      }
      throw error;
    }
    if (metadata.ownerId !== record.ownerId) {
      throw new StateStoreError('Run lock ownership was lost', 'LOCK_OWNERSHIP_LOST', { runId });
    }
    return record;
  }

  async releaseLock(token) {
    const record = token && lockRecords.get(token);
    if (!record || record.store !== this || record.released) return;
    await this.#assertLock(record.runId, token);
    record.released = true;
    await record.handle.close();
    await unlink(this.lockPath(record.runId)).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    await syncDirectory(this.runDirectory(record.runId));
  }

  async initialize(runId, token, initial = {}) {
    await this.#assertLock(runId, token);
    try {
      await stat(this.statePath(runId));
      return this.read(runId);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const state = initialState(runId, initial);
    validateState(state, runId);
    await atomicWriteJson(this.statePath(runId), state);
    return this.read(runId);
  }

  async read(runId) {
    let text;
    try {
      text = await readFile(this.statePath(runId), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new StateStoreError(`State does not exist: ${runId}`, 'STATE_NOT_FOUND', { runId });
      }
      throw error;
    }
    try {
      const state = JSON.parse(text);
      validateState(state, runId);
      return state;
    } catch (error) {
      if (error instanceof StateStoreError) throw error;
      throw new StateStoreError(`State is invalid: ${runId}`, 'STATE_CORRUPT', { runId });
    }
  }

  async #repairJournalTail(runId, token) {
    await this.#assertLock(runId, token);
    const path = this.journalPath(runId);
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (text.length === 0 || text.endsWith('\n')) {
      parseJournalLines(text, runId);
      return false;
    }
    parseJournalLines(text, runId, { allowPartialTail: true });
    const lastNewline = text.lastIndexOf('\n');
    const validLength = lastNewline < 0 ? 0 : Buffer.byteLength(text.slice(0, lastNewline + 1));
    const handle = await open(path, 'r+');
    try {
      await handle.truncate(validLength);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(dirname(path));
    return true;
  }

  async readJournal(runId) {
    let text;
    try {
      text = await readFile(this.journalPath(runId), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    return parseJournalLines(text, runId);
  }

  async #appendEvent(runId, token, event) {
    await this.#assertLock(runId, token);
    validateEvent(event);
    await this.#repairJournalTail(runId, token);
    const path = this.journalPath(runId);
    await ensurePrivateDirectory(dirname(path));
    const handle = await open(path, 'a', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(sanitizeForPersistence(event))}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await bestEffortChmod(path, 0o600);
  }

  async #reconcileJournal(runId, token, state) {
    await this.#repairJournalTail(runId, token);
    const journal = await this.readJournal(runId);
    const journalSequence = journal.at(-1)?.sequence ?? 0;
    if (journalSequence === state.lastEventSequence) return journal;
    if (
      state.lastEventSequence === journalSequence + 1 &&
      state.lastEvent?.sequence === state.lastEventSequence
    ) {
      await this.#appendEvent(runId, token, state.lastEvent);
      return [...journal, state.lastEvent];
    }
    throw new StateStoreError('Snapshot and journal have diverged', 'JOURNAL_DIVERGED', {
      runId,
      stateSequence: state.lastEventSequence,
      journalSequence,
    });
  }

  async #persistEvent(runId, token, state, type, data) {
    await this.#assertLock(runId, token);
    await this.#reconcileJournal(runId, token, state);
    const sanitizedData = sanitizeForPersistence(data);
    const event = validateEvent({
      schemaVersion: 1,
      sequence: state.lastEventSequence + 1,
      type,
      at: new Date().toISOString(),
      data: sanitizedData,
    });
    state.lastEventSequence = event.sequence;
    state.lastEvent = event;
    validateState(state, runId);
    await atomicWriteJson(this.statePath(runId), state);
    await this.#appendEvent(runId, token, event);
    return event;
  }

  async write(runId, token, requestedState) {
    await this.#assertLock(runId, token);
    validateState(requestedState, runId);
    const current = await this.read(runId);
    if (
      requestedState.lastEventSequence !== current.lastEventSequence ||
      JSON.stringify(requestedState.lastEvent) !== JSON.stringify(current.lastEvent) ||
      JSON.stringify(requestedState.operations) !== JSON.stringify(current.operations)
    ) {
      throw new StateStoreError(
        'Direct write may only change the closed run status field',
        'INVALID_STATE_MUTATION',
      );
    }
    if (requestedState.status === current.status) return current;
    current.status = requestedState.status;
    await this.#persistEvent(runId, token, current, 'RUN_STATUS_CHANGED', {
      status: current.status,
    });
    return this.read(runId);
  }

  async recordEvent(runId, token, type, data = {}) {
    await this.#assertLock(runId, token);
    if (type !== 'RUN_NOTE') {
      throw new StateStoreError('Only the closed RUN_NOTE event is caller-recordable', 'INVALID_EVENT_TYPE');
    }
    const state = await this.read(runId);
    return this.#persistEvent(runId, token, state, type, data);
  }

  async planOperation(runId, token, operationId) {
    await this.#assertLock(runId, token);
    assertSafeName(operationId, OPERATION_ID_PATTERN, 'operation id');
    const state = await this.read(runId);
    const existing = state.operations[operationId];
    if (existing) return existing;

    const operation = {
      status: 'planned',
      effect: 'non-idempotent',
      plannedAt: new Date().toISOString(),
    };
    state.operations[operationId] = operation;
    await this.#persistEvent(runId, token, state, 'OPERATION_PLANNED', { operationId });
    return operation;
  }

  async confirmOperation(runId, token, operationId) {
    await this.#assertLock(runId, token);
    assertSafeName(operationId, OPERATION_ID_PATTERN, 'operation id');
    const state = await this.read(runId);
    const existing = state.operations[operationId];
    if (!existing) {
      throw new StateStoreError(
        'Operation must be planned before confirmation',
        'OPERATION_NOT_PLANNED',
        { operationId },
      );
    }
    if (existing.status === 'confirmed') return existing;
    if (existing.status === 'outcome_unknown') {
      throw new StateStoreError(
        'Operation outcome must be reconciled before confirmation',
        'RECONCILIATION_REQUIRED',
        { operationId },
      );
    }
    if (existing.status !== 'planned') {
      throw new StateStoreError('Unexpected operation state', 'INVALID_OPERATION_STATE', {
        operationId,
      });
    }

    const operation = {
      ...existing,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    };
    state.operations[operationId] = operation;
    await this.#persistEvent(runId, token, state, 'OPERATION_CONFIRMED', { operationId });
    return operation;
  }

  async resume(runId, token) {
    await this.#assertLock(runId, token);
    const state = await this.read(runId);
    await this.#reconcileJournal(runId, token, state);
    const plannedOperations = Object.entries(state.operations)
      .filter(([, operation]) => operation.status === 'planned')
      .map(([operationId]) => operationId);

    for (const operationId of plannedOperations) {
      state.operations[operationId] = {
        ...state.operations[operationId],
        status: 'outcome_unknown',
        outcomeUnknownAt: new Date().toISOString(),
      };
      await this.#persistEvent(runId, token, state, 'OPERATION_OUTCOME_UNKNOWN', {
        operationId,
      });
    }

    const finalState = await this.read(runId);
    const journal = await this.readJournal(runId);
    const outcomeUnknownOperations = Object.entries(finalState.operations)
      .filter(([, operation]) => operation.status === 'outcome_unknown')
      .map(([operationId]) => operationId);
    return {
      state: finalState,
      journal,
      pendingOperations: [],
      retryableOperations: [],
      outcomeUnknownOperations,
      reconciliationRequired: outcomeUnknownOperations.length > 0,
    };
  }
}
