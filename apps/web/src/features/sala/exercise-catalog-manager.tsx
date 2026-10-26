'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { createSalaExerciseDefinition, listSalaExerciseDefinitions, retireSalaExerciseDefinition, updateSalaExerciseDefinition } from '@athleta/api-client';
import { exerciseDefinitionSchema, filterExerciseDefinitions } from './exercise-catalog';
import { errorMessage, fieldClass, type ExerciseDefinition } from './routine-editor';

type ExerciseValues = z.infer<typeof exerciseDefinitionSchema>;
type CatalogError = Error & { code?: string; details?: { activeRoutines?: number } };
const emptyValues: ExerciseValues = { name: '', primaryMuscle: '', description: '' };

function checkResponse(response: { status: number; data: unknown }): void {
  if (response.status < 400) return;
  const body = response.data as { message?: string; code?: string; details?: CatalogError['details'] } | null;
  const message = body?.code === 'SALA_EXERCISE_DUPLICATE' ? 'Ya existe un ejercicio con ese nombre.' : body?.message ?? 'No se pudo completar la operación.';
  throw Object.assign(new Error(message), { code: body?.code, details: body?.details });
}

export function ExerciseCatalogManager({ csrfToken, canManage }: { csrfToken: string; canManage: boolean }): React.JSX.Element {
  const client = useQueryClient();
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: async () => {
    const response = await listSalaExerciseDefinitions(options);
    checkResponse(response);
    return response.data.data;
  } });
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retirement, setRetirement] = useState<{ id: string; activeRoutines: number } | null>(null);
  const submitting = useRef(false);
  const form = useForm<ExerciseValues>({ resolver: zodResolver(exerciseDefinitionSchema), defaultValues: emptyValues });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['sala-exercise-definitions'] }),
    client.invalidateQueries({ queryKey: ['sala-routine-templates'] }),
    client.invalidateQueries({ queryKey: ['sala-routines'] }),
  ]);
  const save = useMutation({ mutationFn: async ({ id, values }: { id: string | null; values: ExerciseValues }) => {
    const response = id ? await updateSalaExerciseDefinition(id, values, options) : await createSalaExerciseDefinition(values, options);
    checkResponse(response);
  }, onSuccess: async (_data, { id }) => {
    form.reset(emptyValues); setEditingId(null); setFormOpen(false);
    setFeedback(id ? 'Ejercicio actualizado correctamente.' : 'Ejercicio creado correctamente.');
    await refresh();
  }, onSettled: () => { submitting.current = false; } });
  const retire = useMutation({ mutationFn: async ({ id, confirmActiveRoutineImpact }: { id: string; confirmActiveRoutineImpact: boolean }) => {
    const response = await retireSalaExerciseDefinition(id, { confirmActiveRoutineImpact }, options);
    checkResponse(response);
  }, onSuccess: async () => {
    setRetirement(null); setFeedback('Ejercicio retirado correctamente.'); await refresh();
  }, onError: (error: CatalogError, { id }) => {
    if (error.code === 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED' && typeof error.details?.activeRoutines === 'number') {
      setRetirement({ id, activeRoutines: error.details.activeRoutines });
    }
  } });
  const busy = save.isPending || retire.isPending;
  const openForm = (exercise?: ExerciseDefinition) => {
    save.reset(); retire.reset(); setFeedback(null); setEditingId(exercise?.id ?? null);
    form.reset(exercise ? { name: exercise.name, primaryMuscle: exercise.primaryMuscle ?? '', description: exercise.description ?? '' } : emptyValues);
    setFormOpen(true);
  };
  const submit = form.handleSubmit(values => {
    if (!canManage || submitting.current || busy) return;
    submitting.current = true; setFeedback(null); save.mutate({ id: editingId, values });
  });
  const results = filterExerciseDefinitions(definitions.data ?? [], search).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const retireNeedsConfirmation = (retire.error as CatalogError | null)?.code === 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED';

  return <section aria-labelledby="exercise-catalog-title" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="exercise-catalog-title" className="text-xl font-semibold">Catálogo de ejercicios</h2>
      {canManage ? <Button type="button" disabled={formOpen || busy || Boolean(retirement)} onClick={() => openForm()}>+ Nuevo ejercicio</Button> : null}
    </header>
    {feedback ? <p role="status" className="text-sm">{feedback}</p> : null}
    {canManage && formOpen ? <form aria-label={editingId ? 'Editar ejercicio' : 'Nuevo ejercicio'} noValidate onSubmit={submit} className="space-y-4 rounded-md border bg-white p-4">
      <h3 className="font-semibold">{editingId ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h3>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre *<input className={`${fieldClass} mt-1`} maxLength={120} required aria-invalid={Boolean(form.formState.errors.name)} aria-describedby="exercise-name-error" {...form.register('name')} />{form.formState.errors.name ? <span id="exercise-name-error" role="alert" className="mt-1 block text-red-700">{form.formState.errors.name.message}</span> : null}</label>
        <label className="text-sm">Músculo principal (opcional)<input className={`${fieldClass} mt-1`} maxLength={120} aria-invalid={Boolean(form.formState.errors.primaryMuscle)} aria-describedby="exercise-muscle-error" {...form.register('primaryMuscle')} />{form.formState.errors.primaryMuscle ? <span id="exercise-muscle-error" role="alert" className="mt-1 block text-red-700">{form.formState.errors.primaryMuscle.message}</span> : null}</label>
        <label className="text-sm sm:col-span-2">Descripción (opcional)<textarea className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-ring" maxLength={500} aria-invalid={Boolean(form.formState.errors.description)} aria-describedby="exercise-description-error" {...form.register('description')} />{form.formState.errors.description ? <span id="exercise-description-error" role="alert" className="mt-1 block text-red-700">{form.formState.errors.description.message}</span> : null}</label>
      </fieldset>
      {save.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); form.reset(emptyValues); save.reset(); }}>Cancelar</Button>
        <Button type="submit" disabled={busy}>{save.isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear ejercicio'}</Button>
      </div>
    </form> : null}
    <label className="block text-sm">Buscar ejercicios<input type="search" className={`${fieldClass} mt-1`} placeholder="Buscar por nombre, músculo o descripción" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {definitions.isPending ? <p role="status" className="text-sm text-muted-foreground">Cargando catálogo de ejercicios…</p> : definitions.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage(definitions.error)}</p> : <>
      {!results.length ? <p className="text-sm text-muted-foreground">{search.trim() ? 'No hay ejercicios que coincidan.' : 'Todavía no hay ejercicios en el catálogo.'}</p> : <ul aria-label="Ejercicios disponibles" className="divide-y rounded-md border bg-white">{results.map(exercise => <li key={exercise.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 break-words"><h3 className="font-medium">{exercise.name}</h3>{exercise.primaryMuscle ? <p className="mt-1 text-sm text-muted-foreground">{exercise.primaryMuscle}</p> : null}{exercise.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{exercise.description}</p> : null}</div>
        {canManage ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={formOpen || busy || Boolean(retirement)} onClick={() => openForm(exercise)}>Editar</Button><Button type="button" variant="ghost" disabled={formOpen || busy || Boolean(retirement)} onClick={() => { setFeedback(null); retire.mutate({ id: exercise.id, confirmActiveRoutineImpact: false }); }}>Retirar</Button></div> : null}
      </li>)}</ul>}
    </>}
    {retire.isError && !retireNeedsConfirmation ? <p role="alert" className="text-sm text-red-700">{errorMessage(retire.error)}</p> : null}
    {retirement ? <div role="alertdialog" aria-label="Confirmar retiro" className="space-y-3 rounded-md border bg-white p-4">
      <p className="text-sm">Este ejercicio se utiliza en {retirement.activeRoutines} Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={retire.isPending} onClick={() => retire.mutate({ id: retirement.id, confirmActiveRoutineImpact: true })}>Confirmar retiro</Button><Button type="button" variant="secondary" disabled={retire.isPending} onClick={() => { setRetirement(null); retire.reset(); }}>Cancelar retiro</Button></div>
    </div> : null}
  </section>;
}
