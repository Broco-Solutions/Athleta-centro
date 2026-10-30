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
  return exercises.some(exercise => (exercise.blockPosition ?? 0) > 0);
}

export function groupRoutineBlocks<T extends BlockExercise>(exercises: readonly T[]): { position: number; label: string; series: string | null; exercises: T[] }[] {
  const blocks = new Map<number, { position: number; label: string; series: string | null; exercises: T[] }>();
  for (const exercise of exercises) {
    const position = exercise.blockPosition;
    if (position == null || position < 1) continue;
    let block = blocks.get(position);
    if (!block) {
      block = { position, label: blockLabel(position), series: exercise.series ?? null, exercises: [] };
      blocks.set(position, block);
    }
    block.exercises.push(exercise);
  }
  return [...blocks.values()];
}
