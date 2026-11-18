import { hasCompleteTraining } from './training-completion';

const exercise = (id: string, requiresWeight: boolean | null) => ({ id, exerciseDefinitionId: 'definition', exerciseDefinition: { requiresWeight } });
const firstDay = { id: 'day-1', exercises: [exercise('a', true), exercise('unweighted', false)] };
const secondDay = { id: 'day-2', exercises: [exercise('b', true)] };
const slots = (dayId: string, routineExerciseId: string) => ['2026-10', '2026-11'].flatMap(month => [1, 2].map(weekNumber => ({
  personId: 'person', routineDayId: dayId, month, weekNumber,
  exercises: [{ routineExerciseId, exerciseDefinitionId: 'definition' }],
})));

it('counts four distinct monthly slots for each required occurrence across days and months', () => {
  const first = slots(firstDay.id, 'a'), second = slots(secondDay.id, 'b');
  const days = [firstDay, secondDay];
  expect(hasCompleteTraining({ personId: 'person', days, trainingRecords: [...first, ...second] })).toBe(true);
  expect(hasCompleteTraining({ personId: 'person', days, trainingRecords: [...first, ...second.slice(1), second[1]!] })).toBe(false);
  expect(hasCompleteTraining({ personId: 'person', days, trainingRecords: [...first, ...second.slice(1), { ...second[0]!, personId: 'other' }] })).toBe(false);
  expect(hasCompleteTraining({ personId: 'person', days, trainingRecords: [...first, ...second.slice(1), { ...second[0]!, routineDayId: 'day-1' }] })).toBe(false);
});

it('requires a fully classified plan with at least one weighted occurrence', () => {
  const routine = { personId: 'person', trainingRecords: slots(firstDay.id, 'a') };
  expect(hasCompleteTraining({ ...routine, days: [firstDay] })).toBe(true);
  expect(hasCompleteTraining({ ...routine, days: [firstDay, { ...secondDay, exercises: [exercise('unknown', null)] }] })).toBe(false);
  expect(hasCompleteTraining({ ...routine, days: [{ ...firstDay, exercises: [exercise('a', false)] }] })).toBe(false);
  expect(hasCompleteTraining({ ...routine, days: [] })).toBe(false);
  expect(hasCompleteTraining({ ...routine, days: [firstDay, secondDay] })).toBe(false);
});
