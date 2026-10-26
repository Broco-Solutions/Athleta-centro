import { z } from 'zod';

export const exerciseDefinitionSchema = z.object({
  name: z.string().trim().min(1, 'El Nombre es obligatorio.').max(120, 'El Nombre admite hasta 120 caracteres.'),
  primaryMuscle: z.string().trim().max(120, 'El Músculo principal admite hasta 120 caracteres.'),
  description: z.string().trim().max(500, 'La Descripción admite hasta 500 caracteres.'),
});

type SearchableExercise = {
  name: string;
  primaryMuscle?: string | null | undefined;
  description?: string | null | undefined;
  isActive: boolean;
};

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Every word must match somewhere in the active exercise's three catalog fields. */
export function filterExerciseDefinitions<T extends SearchableExercise>(definitions: readonly T[], search: string): T[] {
  const words = normalizeSearch(search).trim().split(/\s+/).filter(Boolean);
  return definitions.filter(item => {
    if (item.isActive !== true) return false;
    const text = normalizeSearch(`${item.name} ${item.primaryMuscle ?? ''} ${item.description ?? ''}`);
    return words.every(word => text.includes(word));
  });
}
