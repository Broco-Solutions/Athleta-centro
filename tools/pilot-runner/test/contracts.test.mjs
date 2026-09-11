import assert from 'node:assert/strict';
import test from 'node:test';
import { ContractValidationError, validateQueue } from '../lib/contracts.mjs';

function task(id, dependencies = []) {
  return {
    schemaVersion: 1,
    id,
    title: `Task ${id}`,
    objective: 'Produce a concrete result',
    dependencies,
    sourceHints: [],
    scopeHints: { included: [], excluded: [] },
    acceptanceHints: [],
    authority: 'technical-only',
  };
}

function queue(tasks) {
  return { schemaVersion: 1, tasks };
}

function rejectsQueue(value, expectedIssue) {
  assert.throws(
    () => validateQueue(value),
    (error) =>
      error instanceof ContractValidationError &&
      error.issues.some((issue) => issue.includes(expectedIssue)),
  );
}

test('accepts a valid explicit queue', () => {
  assert.deepEqual(validateQueue(queue([task('ATH-101'), task('ATH-102', ['ATH-101'])])),
    queue([task('ATH-101'), task('ATH-102', ['ATH-101'])]));
});

test('rejects an invalid id', () => {
  rejectsQueue(queue([task('ath-101')]), 'must match');
});

test('rejects duplicate ids', () => {
  rejectsQueue(queue([task('ATH-101'), task('ATH-101')]), 'duplicate id');
});

test('rejects a missing dependency', () => {
  rejectsQueue(queue([task('ATH-101', ['ATH-999'])]), 'unknown dependency');
});

test('rejects a self dependency', () => {
  rejectsQueue(queue([task('ATH-101', ['ATH-101'])]), 'self dependency');
});

test('rejects dependency cycles', () => {
  rejectsQueue(
    queue([task('ATH-101', ['ATH-103']), task('ATH-102', ['ATH-101']), task('ATH-103', ['ATH-102'])]),
    'dependency cycle',
  );
});

test('rejects unknown fields', () => {
  rejectsQueue(queue([{ ...task('ATH-101'), state: 'BUILD' }]), 'unknown field "state"');
});

test('rejects path traversal embedded in an id', () => {
  rejectsQueue(queue([task('ATH-../../etc')]), 'must match');
});
