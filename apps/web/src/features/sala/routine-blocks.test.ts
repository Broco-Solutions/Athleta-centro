import { blockLabel, groupRoutineBlocks, isGroupedDay } from './routine-blocks';

it.each([[1, 'A'], [2, 'B'], [3, 'C'], [26, 'Z'], [27, 'AA'], [28, 'AB']] as const)('labels block %s as %s', (position, label) => expect(blockLabel(position)).toBe(label));
it('groups without mutating or reordering exercises and recovers shared series', () => {
  const exercises = Object.freeze([Object.freeze({ blockPosition: 1, position: 2, series: '4', id: 'first' }), Object.freeze({ blockPosition: 1, position: 1, series: '4', id: 'second' }), Object.freeze({ blockPosition: 2, position: 3, series: '3', id: 'third' })]);
  expect(isGroupedDay(exercises)).toBe(true);
  expect(groupRoutineBlocks(exercises)).toEqual([{ position: 1, label: 'A', series: '4', exercises: [exercises[0], exercises[1]] }, { position: 2, label: 'B', series: '3', exercises: [exercises[2]] }]);
  expect(exercises.map(e => e.id)).toEqual(['first', 'second', 'third']);
});
it('keeps legacy and empty days ungrouped', () => {
  expect(isGroupedDay([])).toBe(false); expect(isGroupedDay([{ blockPosition: null }, {}])).toBe(false);
  expect(groupRoutineBlocks([{ blockPosition: null, series: '7' }, {}])).toEqual([]);
});

it('round-trips mixed legacy and grouped days without IDs or duplicate editable exercises', async () => {
  const { routineDaysToDraft, draftToRoutineDays, copyRoutineDays } = await import('./routine-editor');
  const days = [{ id: 'legacy-day', position: 1, name: 'Anterior', exercises: [{ id: 'legacy-exercise', exerciseDefinitionId: 'a', blockPosition: null, series: 'individual', repetitions: '8', load: '60 kg', rest: '90 s', notes: 'Técnica' }] }, { id: 'grouped-day', position: 2, name: 'Bloques', exercises: [{ id: 'grouped-exercise', exerciseDefinitionId: 'a', blockPosition: 1, series: '4', repetitions: '10' }, { id: 'other-exercise', exerciseDefinitionId: 'b', blockPosition: 1, series: '4', duration: '30 s' }, { id: 'third-exercise', exerciseDefinitionId: 'a', blockPosition: 2, series: '3', notes: 'Controlado' }] }];
  const original = structuredClone(days);
  const draft = routineDaysToDraft(days);
  expect(draft[0]!.blocks).toBeNull(); expect(draft[0]!.exercises[0]!.series).toBe('individual');
  expect(draft[1]!.exercises).toEqual([]); expect(draft[1]!.blocks).toHaveLength(2);
  draft[1]!.blocks![0]!.series = '5';
  const saved = draftToRoutineDays(draft);
  expect(saved[0]!.exercises[0]).not.toHaveProperty('blockPosition'); expect(saved[0]!.exercises[0]).toMatchObject({ series: 'individual', load: '60 kg', rest: '90 s', notes: 'Técnica' });
  expect(saved[1]!.exercises.map(e => [e.blockPosition, e.series])).toEqual([[1, '5'], [1, '5'], [2, '3']]);
  expect(saved[1]!.exercises[1]!.duration).toBe('30 s');
  expect(copyRoutineDays(days)[1]!.exercises.map(e => e.blockPosition)).toEqual([1, 1, 2]);
  for (const day of copyRoutineDays(days)) { expect(day).not.toHaveProperty('id'); for (const e of day.exercises) { expect(e).not.toHaveProperty('id'); expect(e).not.toHaveProperty('key'); } }
  expect(days).toEqual(original);
});
