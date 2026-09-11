import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizeText } from './process.mjs';

export const DEFAULT_STATE_ROOT = '/home/rcoirini/proyectos-bs/athleta-pipeline-state';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SENSITIVE_KEY = /(?:password|passphrase|pin|token|secret|cookie|authorization|database_?url|private_?key|aws_?(?:access|secret|session)|clinical_?(?:body|content|history|notes?))/i;

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
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeForPersistence(entry, seen);
  }
  seen.delete(value);
  return result;
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

export async function atomicWriteJson(path, value) {
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
  return {
    schemaVersion: 1,
    runId,
    status: 'READY',
    lastEventSequence: 0,
    operations: {},
    ...initial,
    schemaVersion: 1,
    runId,
  };
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

  async prepare() {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(join(this.root, 'runs'));
    await access(this.root, fsConstants.R_OK | fsConstants.W_OK);
  }

  async initialize(runId, initial = {}) {
    const directory = this.runDirectory(runId);
    await ensurePrivateDirectory(directory);
    try {
      await stat(this.statePath(runId));
      return this.read(runId);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const state = initialState(runId, initial);
    await atomicWriteJson(this.statePath(runId), state);
    return this.read(runId);
  }

  async acquireLock(runId) {
    const directory = this.runDirectory(runId);
    await ensurePrivateDirectory(directory);
    const path = this.lockPath(runId);
    let handle;
    try {
      handle = await open(path, 'wx', 0o600);
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        'utf8',
      );
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error?.code === 'EEXIST') {
        throw new StateStoreError(`Run is already locked: ${runId}`, 'RUN_LOCKED', { runId });
      }
      throw error;
    }

    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await handle.close();
      await unlink(path).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      await syncDirectory(directory);
    };
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
      if (state.schemaVersion !== 1 || state.runId !== runId || !isPlainObject(state.operations)) {
        throw new Error('invalid shape');
      }
      return state;
    } catch (error) {
      throw new StateStoreError(`State is invalid: ${runId}`, 'STATE_CORRUPT', { runId });
    }
  }

  async write(runId, state) {
    if (!isPlainObject(state) || state.schemaVersion !== 1 || state.runId !== runId) {
      throw new StateStoreError('State identity or schema does not match', 'INVALID_STATE');
    }
    await atomicWriteJson(this.statePath(runId), state);
    return this.read(runId);
  }

  async appendEvent(runId, event) {
    const sanitized = sanitizeForPersistence(event);
    const path = this.journalPath(runId);
    await ensurePrivateDirectory(dirname(path));
    const handle = await open(path, 'a', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(sanitized)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await bestEffortChmod(path, 0o600);
  }

  async recordEvent(runId, type, data = {}) {
    const state = await this.read(runId);
    const sequence = state.lastEventSequence + 1;
    const event = {
      schemaVersion: 1,
      sequence,
      type,
      at: new Date().toISOString(),
      data,
    };
    state.lastEventSequence = sequence;
    state.lastEvent = event;
    await this.write(runId, state);
    await this.appendEvent(runId, event);
    return event;
  }

  async planOperation(runId, operationId, details = {}) {
    assertSafeName(operationId, OPERATION_ID_PATTERN, 'operation id');
    const state = await this.read(runId);
    const existing = state.operations[operationId];
    if (existing) return existing;

    const operation = {
      status: 'planned',
      plannedAt: new Date().toISOString(),
      details: sanitizeForPersistence(details),
    };
    state.operations[operationId] = operation;
    await this.write(runId, state);
    await this.recordEvent(runId, 'OPERATION_PLANNED', { operationId });
    return operation;
  }

  async confirmOperation(runId, operationId, result = {}) {
    assertSafeName(operationId, OPERATION_ID_PATTERN, 'operation id');
    const state = await this.read(runId);
    const existing = state.operations[operationId];
    if (!existing) {
      throw new StateStoreError('Operation must be planned before confirmation', 'OPERATION_NOT_PLANNED', {
        operationId,
      });
    }
    if (existing.status === 'confirmed') return existing;
    if (existing.status !== 'planned') {
      throw new StateStoreError('Unexpected operation state', 'INVALID_OPERATION_STATE', { operationId });
    }

    const operation = {
      ...existing,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      result: sanitizeForPersistence(result),
    };
    state.operations[operationId] = operation;
    await this.write(runId, state);
    await this.recordEvent(runId, 'OPERATION_CONFIRMED', { operationId });
    return operation;
  }

  async readJournal(runId) {
    let text;
    try {
      text = await readFile(this.journalPath(runId), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const complete = text.endsWith('\n');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const events = [];
    for (const [index, line] of lines.entries()) {
      try {
        events.push(JSON.parse(line));
      } catch (error) {
        if (!complete && index === lines.length - 1) break;
        throw new StateStoreError('Journal is corrupt', 'JOURNAL_CORRUPT', { runId, line: index + 1 });
      }
    }
    return events;
  }

  async resume(runId) {
    const state = await this.read(runId);
    const journal = await this.readJournal(runId);
    const pendingOperations = Object.entries(state.operations)
      .filter(([, operation]) => operation.status === 'planned')
      .map(([operationId]) => operationId);
    return { state, journal, pendingOperations };
  }
}
