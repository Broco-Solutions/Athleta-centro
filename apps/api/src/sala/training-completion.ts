type CompletionRoutine = {
  personId: string;
  days: readonly {
    id: string;
    exercises: readonly { id: string; exerciseDefinitionId: string; exerciseDefinition: { requiresWeight: boolean | null } }[];
  }[];
  trainingRecords: readonly {
    personId: string;
    routineDayId: string;
    month: string | null;
    weekNumber: number | null;
    exercises: readonly { routineExerciseId: string; exerciseDefinitionId: string }[];
  }[];
};

/** Input records contain only saved weights from monthly slots 1–4. */
export function hasCompleteTraining(routine: CompletionRoutine): boolean {
  const required = new Map<string, { dayId: string; exerciseDefinitionId: string; slots: Set<string> }>();
  for (const day of routine.days) {
    for (const exercise of day.exercises) {
      const { requiresWeight } = exercise.exerciseDefinition;
      if (requiresWeight === null) return false;
      if (requiresWeight) required.set(exercise.id, { dayId: day.id, exerciseDefinitionId: exercise.exerciseDefinitionId, slots: new Set() });
    }
  }
  if (required.size === 0) return false;

  for (const record of routine.trainingRecords) {
    if (record.personId !== routine.personId || !record.month || record.weekNumber === null) continue;
    const slot = `${record.month}:${record.weekNumber}`;
    for (const exercise of record.exercises) {
      const current = required.get(exercise.routineExerciseId);
      if (current && current.dayId === record.routineDayId && current.exerciseDefinitionId === exercise.exerciseDefinitionId) {
        current.slots.add(slot);
      }
    }
  }

  return [...required.values()].every(exercise => exercise.slots.size >= 4);
}
