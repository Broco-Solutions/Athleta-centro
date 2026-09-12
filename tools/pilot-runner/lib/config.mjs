import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'pilot-v1.json');
const ROOT_KEYS = new Set(['schemaVersion', 'repository', 'runtime', 'tools', 'paths']);
const REPOSITORY_KEYS = new Set(['root', 'origin', 'approvedBaseSha']);
const RUNTIME_KEYS = new Set(['node', 'pnpm']);
const TOOL_KEYS = new Set(['codexExecutable']);
const PATH_KEYS = new Set(['stateRoot', 'worktreeRoot', 'productPdf', 'pipelinePdf']);

export class PilotConfigError extends Error {
  constructor(message, reasonCode = 'INVALID_PILOT_CONFIG') {
    super(message);
    this.name = 'PilotConfigError';
    this.reasonCode = reasonCode;
  }
}

function exactKeys(value, allowed, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PilotConfigError(`${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new PilotConfigError(`${label} has unknown field "${key}"`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new PilotConfigError(`${label} is missing field "${key}"`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new PilotConfigError(`${label} must be a non-empty trimmed string`);
  }
}

function absolutePath(value, label) {
  nonEmptyString(value, label);
  if (!isAbsolute(value)) throw new PilotConfigError(`${label} must be absolute`);
}

function validateConfig(value) {
  exactKeys(value, ROOT_KEYS, 'config');
  if (value.schemaVersion !== 1) throw new PilotConfigError('Unsupported pilot configuration schema');
  exactKeys(value.repository, REPOSITORY_KEYS, 'config.repository');
  exactKeys(value.runtime, RUNTIME_KEYS, 'config.runtime');
  exactKeys(value.tools, TOOL_KEYS, 'config.tools');
  exactKeys(value.paths, PATH_KEYS, 'config.paths');
  absolutePath(value.repository.root, 'config.repository.root');
  nonEmptyString(value.repository.origin, 'config.repository.origin');
  if (!/^[0-9a-f]{40}$/.test(value.repository.approvedBaseSha)) {
    throw new PilotConfigError('config.repository.approvedBaseSha must be a full lowercase SHA');
  }
  nonEmptyString(value.runtime.node, 'config.runtime.node');
  nonEmptyString(value.runtime.pnpm, 'config.runtime.pnpm');
  absolutePath(value.tools.codexExecutable, 'config.tools.codexExecutable');
  absolutePath(value.paths.stateRoot, 'config.paths.stateRoot');
  absolutePath(value.paths.worktreeRoot, 'config.paths.worktreeRoot');
  nonEmptyString(value.paths.productPdf, 'config.paths.productPdf');
  nonEmptyString(value.paths.pipelinePdf, 'config.paths.pipelinePdf');
  return Object.freeze({
    ...value,
    repository: Object.freeze({ ...value.repository }),
    runtime: Object.freeze({ ...value.runtime }),
    tools: Object.freeze({ ...value.tools }),
    paths: Object.freeze({ ...value.paths }),
  });
}

export async function loadPilotConfig() {
  let value;
  try {
    value = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch (error) {
    throw new PilotConfigError(
      `Pilot configuration could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`,
      'PILOT_CONFIG_UNAVAILABLE',
    );
  }
  return validateConfig(value);
}
