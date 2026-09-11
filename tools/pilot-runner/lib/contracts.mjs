const TASK_ID_PATTERN = /^ATH-[0-9]+$/;
const AUTHORITY_VALUES = new Set(['technical-only']);
const QUEUE_KEYS = new Set(['schemaVersion', 'tasks']);
const TASK_KEYS = new Set([
  'schemaVersion',
  'id',
  'title',
  'objective',
  'dependencies',
  'sourceHints',
  'scopeHints',
  'acceptanceHints',
  'authority',
]);
const SCOPE_KEYS = new Set(['included', 'excluded']);

export class ContractValidationError extends Error {
  constructor(issues) {
    super(`Queue validation failed with ${issues.length} issue(s)`);
    this.name = 'ContractValidationError';
    this.reasonCode = 'INVALID_QUEUE';
    this.issues = issues;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unknownKeys(value, allowed, path, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}: unknown field "${key}"`);
  }
}

function nonEmptyString(value, path, issues) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}: expected a non-empty string`);
  }
}

function stringArray(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${path}: expected an array`);
    return;
  }
  value.forEach((entry, index) => nonEmptyString(entry, `${path}[${index}]`, issues));
}

function validateTask(task, index, issues) {
  const path = `tasks[${index}]`;
  if (!isPlainObject(task)) {
    issues.push(`${path}: expected an object`);
    return;
  }
  unknownKeys(task, TASK_KEYS, path, issues);

  if (task.schemaVersion !== 1) issues.push(`${path}.schemaVersion: expected 1`);
  nonEmptyString(task.id, `${path}.id`, issues);
  if (typeof task.id === 'string' && !TASK_ID_PATTERN.test(task.id)) {
    issues.push(`${path}.id: must match ${TASK_ID_PATTERN}`);
  }
  nonEmptyString(task.title, `${path}.title`, issues);
  nonEmptyString(task.objective, `${path}.objective`, issues);
  stringArray(task.dependencies, `${path}.dependencies`, issues);
  stringArray(task.sourceHints, `${path}.sourceHints`, issues);
  stringArray(task.acceptanceHints, `${path}.acceptanceHints`, issues);

  if (!isPlainObject(task.scopeHints)) {
    issues.push(`${path}.scopeHints: expected an object`);
  } else {
    unknownKeys(task.scopeHints, SCOPE_KEYS, `${path}.scopeHints`, issues);
    stringArray(task.scopeHints.included, `${path}.scopeHints.included`, issues);
    stringArray(task.scopeHints.excluded, `${path}.scopeHints.excluded`, issues);
  }

  if (!AUTHORITY_VALUES.has(task.authority)) {
    issues.push(`${path}.authority: unsupported authority`);
  }
}

function detectCycles(tasks, issues) {
  const dependencies = new Map(tasks.map((task) => [task.id, task.dependencies]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, path) {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      issues.push(`tasks: dependency cycle ${[...path.slice(cycleStart), id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (dependencies.has(dependency)) visit(dependency, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of dependencies.keys()) visit(id, []);
}

export function validateQueue(value) {
  const issues = [];
  if (!isPlainObject(value)) {
    throw new ContractValidationError(['queue: expected an object']);
  }
  unknownKeys(value, QUEUE_KEYS, 'queue', issues);
  if (value.schemaVersion !== 1) issues.push('queue.schemaVersion: expected 1');
  if (!Array.isArray(value.tasks)) {
    issues.push('queue.tasks: expected an array');
  } else {
    value.tasks.forEach((task, index) => validateTask(task, index, issues));

    const validTasks = value.tasks.filter(
      (task) => isPlainObject(task) && typeof task.id === 'string' && Array.isArray(task.dependencies),
    );
    const knownIds = new Set();
    for (const task of validTasks) {
      if (knownIds.has(task.id)) issues.push(`tasks: duplicate id "${task.id}"`);
      knownIds.add(task.id);
    }
    for (const task of validTasks) {
      const seenDependencies = new Set();
      for (const dependency of task.dependencies) {
        if (dependency === task.id) issues.push(`${task.id}: self dependency is not allowed`);
        if (!knownIds.has(dependency)) issues.push(`${task.id}: unknown dependency "${dependency}"`);
        if (seenDependencies.has(dependency)) {
          issues.push(`${task.id}: duplicate dependency "${dependency}"`);
        }
        seenDependencies.add(dependency);
      }
    }
    detectCycles(validTasks, issues);
  }

  if (issues.length > 0) throw new ContractValidationError(issues);
  return structuredClone(value);
}

export function parseQueueJson(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ContractValidationError([
      `queue: invalid JSON (${error instanceof Error ? error.message : 'unknown error'})`,
    ]);
  }
  return validateQueue(value);
}

export function assertSafeTaskId(id) {
  if (typeof id !== 'string' || !TASK_ID_PATTERN.test(id)) {
    throw new ContractValidationError([`task id: must match ${TASK_ID_PATTERN}`]);
  }
  return id;
}

export { TASK_ID_PATTERN };
