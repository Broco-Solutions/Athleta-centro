import { filterExerciseDefinitions } from './exercise-catalog';

const squat = { id: 'squat', name: 'Sentadilla búlgara', primaryMuscle: 'Cuádriceps', description: 'Fuerza unilateral, estabilidad, piernas, fútbol, hockey.', isActive: true };
const plank = { id: 'plank', name: 'Plancha', isActive: true };
const retired = { ...squat, id: 'retired', isActive: false };

it.each(['sentadilla', 'CUADRICEPS', 'futbol', 'fuerza', 'hockey', 'bulg', 'futbol fuerza', 'sentadilla futbol', '  FÚTBOL   cuádriceps  '])('matches all words across name, muscle and description: %s', search => {
  expect(filterExerciseDefinitions([squat, plank, retired], search)).toEqual([squat]);
});

it.each(['tenis', 'sentadilla tenis', 'futbol plancha'])('excludes exercises missing any search word: %s', search => {
  expect(filterExerciseDefinitions([squat, plank, retired], search)).toEqual([]);
});

it('preserves order and only offers active definitions, including with an empty search', () => {
  expect(filterExerciseDefinitions([plank, retired, squat], '   ')).toEqual([plank, squat]);
  expect(filterExerciseDefinitions([{ ...plank, primaryMuscle: null, description: null }], 'planc')).toHaveLength(1);
});
