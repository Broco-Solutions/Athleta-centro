'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@athleta/ui';

export type RoutineExercise = {
  id?: string;
  position?: number;
  exerciseDefinitionId: string;
  exerciseName?: string;
  series?: string | null;
  repetitions?: string | null | undefined;
  duration?: string | null | undefined;
  load?: string | null | undefined;
  rest?: string | null | undefined;
  notes?: string | null | undefined;
};

export type RoutineDay = {
  id?: string;
  position: number;
  name?: string | null;
  exercises: RoutineExercise[];
};

export type Routine = {
  id: string;
  personId: string;
  salaParticipationId: string;
  status: 'ACTIVE' | 'HISTORICAL';
  version: number;
  createdAt?: string;
  days: RoutineDay[];
};

export type ExerciseDefinition = {
  id: string;
  name: string;
  primaryMuscle: string;
  description?: string | null;
  isActive: boolean;
};

export type RoutineInput = {
  personId: string;
  salaParticipationId: string;
  days: Array<{
    position: number;
    name?: string;
    exercises: Array<{ exerciseDefinitionId: string; series: string; repetitions: string | null; duration: string | null; load: string | null; rest: string | null; notes: string | null }>;
  }>;
};

/**
 * The generated Orval client is intentionally injected by the page adapter.
 * This keeps the feature independent of generated symbol names while the API
 * contract is being regenerated, without introducing a second HTTP client.
 */
export type RoutineApi = {
  list: (personId: string, options: RequestInit) => Promise<Routine[]>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  create: (input: RoutineInput, options: RequestInit) => Promise<unknown>;
  replace: (routineId: string, input: RoutineInput, options: RequestInit) => Promise<unknown>;
  createExercise: (input: { name: string; primaryMuscle: string; description?: string }, options: RequestInit) => Promise<unknown>;
};

const exerciseSchema = z.object({
  exerciseDefinitionId: z.string().min(1, 'Seleccioná un ejercicio'),
  series: z.string().trim().min(1, 'Ingresá las series'),
  repetitions: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  load: z.string().trim().optional(),
  rest: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type ExerciseForm = z.infer<typeof exerciseSchema>;

const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function emptyExercise(): ExerciseForm {
  return { exerciseDefinitionId: '', series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' };
}

function displayExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return exercise.exerciseName ?? definitions.find((item) => item.id === exercise.exerciseDefinitionId)?.name ?? 'Ejercicio';
}

function RoutineExerciseForm({ definitions, onAdd, disabled }: { definitions: ExerciseDefinition[]; onAdd: (exercise: ExerciseForm) => void; disabled: boolean }): React.JSX.Element {
  const [form, setForm] = useState<ExerciseForm>(emptyExercise);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = exerciseSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisá los datos del ejercicio.');
      return;
    }
    onAdd({ exerciseDefinitionId: parsed.data.exerciseDefinitionId, series: parsed.data.series, repetitions: parsed.data.repetitions ?? '', duration: parsed.data.duration ?? '', load: parsed.data.load ?? '', rest: parsed.data.rest ?? '', notes: parsed.data.notes ?? '' });
    setForm(emptyExercise());
    setError(null);
  };

  return (
    <form className="mt-3 grid gap-2 rounded-md border bg-white p-3" onSubmit={submit}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Ejercicio<select aria-label="Ejercicio" className={fieldClass} value={form.exerciseDefinitionId} onChange={(event) => setForm((current) => ({ ...current, exerciseDefinitionId: event.target.value }))} disabled={disabled}><option value="">Seleccionar ejercicio</option>{definitions.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.primaryMuscle}</option>)}</select></label>
        <label className="text-sm">Series<input aria-label="Series" className={fieldClass} value={form.series} onChange={(event) => setForm((current) => ({ ...current, series: event.target.value }))} disabled={disabled} /></label>
        <label className="text-sm">Repeticiones<input aria-label="Repeticiones" className={fieldClass} value={form.repetitions} onChange={(event) => setForm((current) => ({ ...current, repetitions: event.target.value }))} disabled={disabled} /></label>
        <label className="text-sm">Duración<input aria-label="Duración" className={fieldClass} value={form.duration} onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))} disabled={disabled} /></label>
        <label className="text-sm">Carga<input aria-label="Carga" className={fieldClass} value={form.load} onChange={(event) => setForm((current) => ({ ...current, load: event.target.value }))} disabled={disabled} /></label>
        <label className="text-sm">Descanso<input aria-label="Descanso" className={fieldClass} value={form.rest} onChange={(event) => setForm((current) => ({ ...current, rest: event.target.value }))} disabled={disabled} /></label>
      </div>
      <label className="text-sm">Notas<textarea aria-label="Notas del ejercicio" className="min-h-16 w-full rounded-md border bg-white px-3 py-2 text-sm" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={disabled} /></label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" variant="secondary" disabled={disabled}>Agregar ejercicio</Button>
    </form>
  );
}

export function RoutinePanel({ personId, participationId, csrfToken, api }: { personId: string; participationId: string; csrfToken: string; api: RoutineApi }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [dayName, setDayName] = useState('Día 1');
  const [exercises, setExercises] = useState<ExerciseForm[]>([]);
  const [newExercise, setNewExercise] = useState({ name: '', primaryMuscle: '', description: '' });
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: () => api.list(personId, options), enabled: Boolean(personId && participationId) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options) });
  const active = routines.data?.find((routine) => routine.status === 'ACTIVE');
  const historical = routines.data?.filter((routine) => routine.status === 'HISTORICAL') ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: [{ position: 1, name: dayName.trim() || 'Día 1', exercises: exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series, repetitions: exercise.repetitions ?? null, duration: exercise.duration ?? null, load: exercise.load ?? null, rest: exercise.rest ?? null, notes: exercise.notes ?? null })) }] };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setEditing(false); setExercises([]); await queryClient.invalidateQueries({ queryKey: ['sala-routines', personId] }); },
  });
  const exerciseMutation = useMutation({ mutationFn: () => api.createExercise(newExercise, options), onSuccess: async () => { setNewExercise({ name: '', primaryMuscle: '', description: '' }); await queryClient.invalidateQueries({ queryKey: ['sala-exercise-definitions'] }); } });

  const startEditing = () => {
    if (active) {
      const firstDay = active.days[0];
      setDayName(firstDay?.name ?? `Día ${firstDay?.position ?? 1}`);
      setExercises(firstDay?.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series ?? '', repetitions: exercise.repetitions ?? '', duration: exercise.duration ?? '', load: exercise.load ?? '', rest: exercise.rest ?? '', notes: exercise.notes ?? '' })) ?? []);
    } else {
      setDayName('Día 1');
      setExercises([]);
    }
    setEditing(true);
  };

  return (
    <section aria-labelledby="routine-heading" className="mt-4 rounded-md border bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="routine-heading" className="font-semibold">Rutina</h3><p className="text-sm text-muted-foreground">Planificación de entrenamiento vigente e histórica.</p></div>{participationId ? <Button type="button" variant="secondary" onClick={startEditing}>{active ? 'Reemplazar rutina' : 'Crear rutina'}</Button> : null}</div>
      <details className="mt-3 rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Administrar ejercicios</summary><p className="mt-2 text-xs text-muted-foreground">Catálogo utilizado para armar rutinas.</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><input aria-label="Nombre del ejercicio" placeholder="Nombre" value={newExercise.name} onChange={(event) => setNewExercise((current) => ({ ...current, name: event.target.value }))} /><input aria-label="Grupo muscular" placeholder="Grupo muscular" value={newExercise.primaryMuscle} onChange={(event) => setNewExercise((current) => ({ ...current, primaryMuscle: event.target.value }))} /><input aria-label="Descripción del ejercicio" placeholder="Descripción opcional" value={newExercise.description} onChange={(event) => setNewExercise((current) => ({ ...current, description: event.target.value }))} /></div><Button className="mt-2" type="button" disabled={!newExercise.name.trim() || !newExercise.primaryMuscle.trim() || exerciseMutation.isPending} onClick={() => exerciseMutation.mutate()}>Nuevo ejercicio</Button></details>
      {routines.isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando rutina…</p> : null}
      {routines.isError ? <p role="alert" className="mt-3 text-sm text-red-700">No se pudo cargar la rutina.</p> : null}
      {!routines.isLoading && !routines.isError && !active ? <p className="mt-3 text-sm text-muted-foreground">No hay una rutina activa.</p> : null}
      {active ? <RoutineSummary routine={active} definitions={definitions.data ?? []} /> : null}
      {historical.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Rutinas históricas ({historical.length})</summary><div className="mt-2 grid gap-2">{historical.map((routine) => <RoutineSummary key={routine.id} routine={routine} definitions={definitions.data ?? []} />)}</div></details> : null}
      {editing ? <div className="mt-4 rounded-md border bg-white p-4"><h4 className="font-semibold">{active ? 'Nueva versión de rutina' : 'Nueva rutina'}</h4><label className="mt-3 block text-sm">Nombre del día<input aria-label="Nombre del día" className={fieldClass} value={dayName} onChange={(event) => setDayName(event.target.value)} /></label><div className="mt-3">{exercises.length === 0 ? <p className="text-sm text-muted-foreground">Agregá al menos un ejercicio.</p> : <ul className="divide-y rounded-md border">{exercises.map((exercise, index) => <li key={`${exercise.exerciseDefinitionId}-${index}`} className="flex items-center justify-between gap-3 p-3 text-sm"><span>{displayExercise(exercise, definitions.data ?? [])} · {exercise.series} series{exercise.repetitions ? ` · ${exercise.repetitions} rep.` : ''}</span><Button type="button" variant="ghost" onClick={() => setExercises((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button></li>)}</ul>}</div><RoutineExerciseForm definitions={definitions.data ?? []} onAdd={(exercise) => setExercises((items) => [...items, exercise])} disabled={mutation.isPending} />{mutation.isError ? <p role="alert" className="mt-3 text-sm text-red-700">No se pudo guardar la rutina.</p> : null}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || exercises.length === 0}>{mutation.isPending ? 'Guardando…' : active ? 'Reemplazar rutina' : 'Guardar rutina'}</Button></div></div> : null}
    </section>
  );
}

function RoutineSummary({ routine, definitions }: { routine: Routine; definitions: ExerciseDefinition[] }): React.JSX.Element {
  return <article className="mt-3 rounded-md border bg-white p-3"><div className="flex items-center justify-between gap-3"><h4 className="font-medium">Rutina v{routine.version}</h4><span className={routine.status === 'ACTIVE' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800' : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'}>{routine.status === 'ACTIVE' ? 'Activa' : 'Histórica'}</span></div><div className="mt-2 grid gap-3">{routine.days.map((day) => <div key={day.id ?? day.position}><p className="text-sm font-medium">{day.name ?? `Día ${day.position}`}</p>{day.exercises.length === 0 ? <p className="text-xs text-muted-foreground">Sin ejercicios.</p> : <ul className="mt-1 grid gap-1 text-sm">{day.exercises.map((exercise) => <li key={exercise.id ?? `${exercise.exerciseDefinitionId}-${exercise.position ?? 0}`}>{displayExercise(exercise, definitions)} · {exercise.series ?? '—'} series{exercise.repetitions ? ` · ${exercise.repetitions} rep.` : ''}{exercise.load ? ` · carga ${exercise.load}` : ''}</li>)}</ul>}</div>)}</div></article>;
}
