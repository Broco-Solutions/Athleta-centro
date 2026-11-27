type BlockExercise = { blockPosition?: number | null; position?: number; series?: string | null | undefined };

export function blockLabel(position: number): string {
  if (!Number.isInteger(position) || position < 1) throw new RangeError('La posición del bloque debe ser un entero positivo.');
  let label = '';
  while (position > 0) {
    position--;
    label = String.fromCharCode(65 + position % 26) + label;
    position = Math.floor(position / 26);
  }
  return label;
}

export function isGroupedDay<T extends Pick<BlockExercise, 'blockPosition'>>(exercises: readonly T[]): boolean {
  return exercises.some(exercise => exercise.blockPosition != null);
}

export function groupRoutineBlocks<T extends BlockExercise>(exercises: readonly T[]): { position: number | null; label: string; series: string | null; exercises: T[] }[] {
  const blocks = new Map<number | null, { position: number | null; label: string; series: string | null; exercises: T[] }>();
  for (const exercise of exercises) {
    const position = exercise.blockPosition ?? null;
    let block = blocks.get(position);
    if (!block) {
      block = { position, label: position ? blockLabel(position) : '', series: position ? exercise.series ?? null : null, exercises: [] };
      blocks.set(position, block);
    }
    block.exercises.push(exercise);
  }
  return [...blocks.values()].sort((a, b) => (a.position ?? 1) - (b.position ?? 1));
}

export function routineBlockTitle(block: { position: number | null; label: string; series: string | null }): string {
  if (block.position === 0) return 'Entrada en calor';
  return block.position === null ? '' : `Bloque ${block.label}${block.series ? ` — ${block.series} series` : ''}`;
}

export function applyWarmupExercises<Exercise extends { exerciseDefinitionId: string; original?: unknown }>(
  existing: readonly Exercise[], common: readonly Exercise[],
): Exercise[] {
  const remaining = [...existing];
  const applied = common.map(exercise => {
    const index = remaining.findIndex(entry => entry.exerciseDefinitionId === exercise.exerciseDefinitionId);
    const match = index < 0 ? undefined : remaining.splice(index, 1)[0];
    const copy = { ...exercise };
    delete copy.original;
    if (match?.original !== undefined) copy.original = match.original;
    return copy;
  });
  // An active routine can already have records for exercises left outside the common block.
  return [...applied, ...remaining.filter(exercise => exercise.original)];
}

export function formatRoutineRepetitions(value: string | null | undefined): string {
  return value && /^\d+(?:\+\d+)*$/.test(value) ? `${value} rep.` : value ?? '';
}

export function formatRoutineDuration(value: string | null | undefined): string {
  return value && /^\d+$/.test(value) ? `${value} seg.` : value ?? '';
}

export function formatRoutineLoad(value: string | null | undefined): string {
  return value && /^\d+(?:[.,]\d+)?$/.test(value) ? `${value} kg` : value ?? '';
}
