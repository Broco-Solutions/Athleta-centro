'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Folder, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@athleta/ui';
import { createSalaMovementPattern, updateSalaMovementPattern, deleteSalaMovementPattern, listSalaMovementPatterns, createSalaExerciseDefinition, listSalaExerciseDefinitions, retireSalaExerciseDefinition, updateSalaExerciseDefinition } from '@athleta/api-client';
import { exerciseDefinitionSchema, filterExerciseDefinitions } from './exercise-catalog';
import { errorMessage, fieldClass, type ExerciseDefinition } from './routine-editor';

type ExerciseValues = z.infer<typeof exerciseDefinitionSchema>;
type CatalogError = Error & { code?: string; details?: { activeRoutines?: number } };
const CATALOG_PAGE_SIZE = 10;
const emptyValues: ExerciseValues = { name: '', primaryMuscle: '', description: '', movementPatternId: '' };

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
  const patterns = useQuery({ queryKey: ['sala-movement-patterns'], queryFn: async () => {
    const response = await listSalaMovementPatterns(options); checkResponse(response); return response.data.data;
  } });
  const [selectedPattern, setSelectedPattern] = useState('all');
  const [page, setPage] = useState(1);
  const [patternForm, setPatternForm] = useState<{ id?: string; name: string } | null>(null);
  const patternSave = useMutation({ mutationFn: async (draft: { id?: string; name: string }) => {
    const name = draft.name.trim();
    if (!name || name.length > 120) throw new Error('Ingresá un nombre de hasta 120 caracteres.');
    const response = draft.id ? await updateSalaMovementPattern(draft.id, { name }, options) : await createSalaMovementPattern({ name }, options);
    checkResponse(response); return response.data.data;
  }, onSuccess: async pattern => {
    await client.invalidateQueries({ queryKey: ['sala-movement-patterns'] });
    setSelectedPattern(pattern.id); setPage(1); setPatternForm(null);
  } });
  const [patternToDelete, setPatternToDelete] = useState<{ id: string; name: string } | null>(null);
  const patternDelete = useMutation({ mutationFn: async (id: string) => { const response = await deleteSalaMovementPattern(id, options); checkResponse(response); }, onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['sala-movement-patterns'] }), client.invalidateQueries({ queryKey: ['sala-exercise-definitions'] })]);
    setPatternToDelete(null); setSelectedPattern('none'); setPage(1); setSearch(''); setFeedback('Patrón eliminado correctamente.');
  } });
  const selectPattern = (id: string) => { setSelectedPattern(id); setPage(1); };
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
    const response = id ? await updateSalaExerciseDefinition(id, { ...values, movementPatternId: values.movementPatternId || null }, options) : await createSalaExerciseDefinition({ ...values, movementPatternId: values.movementPatternId || null }, options);
    checkResponse(response);
  }, onSuccess: async (_data, { id, values }) => {
    form.reset({ ...emptyValues, movementPatternId: values.movementPatternId ?? '' }); setEditingId(null); setFormOpen(false);
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
    form.reset(exercise ? { name: exercise.name, primaryMuscle: exercise.primaryMuscle ?? '', description: exercise.description ?? '', movementPatternId: exercise.movementPatternId ?? '' } : { ...emptyValues, movementPatternId: selectedPattern !== 'all' && selectedPattern !== 'none' ? selectedPattern : form.getValues('movementPatternId') ?? '' });
    setFormOpen(true);
  };
  const submit = form.handleSubmit(values => {
    if (!canManage || submitting.current || busy) return;
    submitting.current = true; setFeedback(null); save.mutate({ id: editingId, values });
  });
  const active = (definitions.data ?? []).filter(item => item.isActive);
  const results = filterExerciseDefinitions(active, search).filter(item => selectedPattern === 'all' || (selectedPattern === 'none' ? !item.movementPatternId : item.movementPatternId === selectedPattern)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const pages = Math.max(1, Math.ceil(results.length / CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const patternItems = [{ id: 'all', name: 'Todos los ejercicios' }, ...(patterns.data ?? []).slice().sort((a,b) => a.name.localeCompare(b.name, 'es')), { id: 'none', name: 'Sin patrón' }];
  const count = (id: string) => active.filter(item => id === 'all' || (id === 'none' ? !item.movementPatternId : item.movementPatternId === id)).length;
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
        <label className="text-sm">Patrón de movimiento<select aria-label="Patrón de movimiento" className={fieldClass} {...form.register('movementPatternId')}><option value="">Sin patrón</option>{patterns.data?.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select>{form.formState.errors.movementPatternId ? <span role="alert">{form.formState.errors.movementPatternId.message}</span> : null}</label>
        <label className="text-sm">Músculo principal (opcional)<input className={`${fieldClass} mt-1`} maxLength={120} aria-invalid={Boolean(form.formState.errors.primaryMuscle)} aria-describedby="exercise-muscle-error" {...form.register('primaryMuscle')} />{form.formState.errors.primaryMuscle ? <span id="exercise-muscle-error" role="alert" className="mt-1 block text-red-700">{form.formState.errors.primaryMuscle.message}</span> : null}</label>
        <label className="text-sm sm:col-span-2">Descripción (opcional)<textarea className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-ring" maxLength={500} aria-invalid={Boolean(form.formState.errors.description)} aria-describedby="exercise-description-error" {...form.register('description')} />{form.formState.errors.description ? <span id="exercise-description-error" role="alert" className="mt-1 block text-red-700">{form.formState.errors.description.message}</span> : null}</label>
      </fieldset>
      {save.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); form.reset(emptyValues); save.reset(); }}>Cancelar</Button>
        <Button type="submit" disabled={busy}>{save.isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear ejercicio'}</Button>
      </div>
    </form> : null}
    <div className="grid items-start gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-md border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Patrones de movimiento</h3>{canManage ? <Button type="button" variant="ghost" onClick={() => { patternSave.reset(); setPatternForm({ name: '' }); }}>+ Nuevo patrón</Button> : null}</div>
        {patterns.isPending ? <p role="status">Cargando patrones…</p> : null}{patterns.isError ? <p role="alert">{errorMessage(patterns.error)}</p> : null}
        <label className="block text-sm md:hidden">Patrón<select className={fieldClass} value={selectedPattern} onChange={event => selectPattern(event.target.value)}>{patternItems.map(item => <option key={item.id} value={item.id}>{item.name} ({count(item.id)})</option>)}</select></label>
        <ul className="hidden space-y-1 md:block">{patternItems.map(item => { const realPattern = patterns.data?.find(pattern => pattern.id === item.id); return <li key={item.id} className="flex items-center gap-1"><button type="button" aria-label={item.name + ' ' + count(item.id)} aria-pressed={selectedPattern === item.id} onClick={() => selectPattern(item.id)} className={'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm ' + (selectedPattern === item.id ? 'bg-surface-muted font-medium' : '')}><Folder size={16}/><span className="flex-1 break-words">{item.name}</span><span>{count(item.id)}</span></button>{canManage && realPattern ? <><Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={'Renombrar patrón ' + realPattern.name} onClick={() => { patternSave.reset(); setPatternForm({ id: realPattern.id, name: realPattern.name }); }}><Pencil size={14}/></Button><Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={'Eliminar patrón ' + realPattern.name} onClick={() => { patternDelete.reset(); setPatternToDelete(realPattern); }}><Trash2 size={14}/></Button></> : null}</li>; })}</ul>
        {canManage && patterns.data?.some(item => item.id === selectedPattern) ? <div className="flex gap-2 md:hidden"><Button type="button" variant="ghost" aria-label={'Renombrar patrón ' + patterns.data.find(item => item.id === selectedPattern)?.name} onClick={() => { const item = patterns.data?.find(pattern => pattern.id === selectedPattern); if (item) { patternSave.reset(); setPatternForm({ id: item.id, name: item.name }); } }}><Pencil size={14}/> Renombrar</Button><Button type="button" variant="ghost" aria-label={'Eliminar patrón ' + patterns.data.find(item => item.id === selectedPattern)?.name} onClick={() => { const item = patterns.data?.find(pattern => pattern.id === selectedPattern); if (item) { patternDelete.reset(); setPatternToDelete(item); } }}><Trash2 size={14}/> Eliminar</Button></div> : null}
        {patternForm ? <form aria-label="Patrón de movimiento" className="space-y-2" onSubmit={event => { event.preventDefault(); if (!patternSave.isPending) patternSave.mutate(patternForm); }}><label className="text-sm">Nombre del patrón<input className={fieldClass} required maxLength={120} value={patternForm.name} onChange={event => setPatternForm({ ...patternForm, name: event.target.value })}/></label>{patternSave.isError ? <p role="alert">{errorMessage(patternSave.error)}</p> : null}<div className="flex gap-2"><Button type="button" variant="ghost" disabled={patternSave.isPending} onClick={() => setPatternForm(null)}>Cancelar</Button><Button type="submit" disabled={patternSave.isPending}>Guardar</Button></div></form> : null}
      </aside>
      <div className="min-w-0 space-y-3"><h3 className="font-semibold">{patternItems.find(item => item.id === selectedPattern)?.name ?? 'Todos los ejercicios'}</h3>
    <label className="block text-sm">Buscar ejercicios<input type="search" className={`${fieldClass} mt-1`} placeholder="Buscar por nombre, músculo o descripción..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
    {definitions.isPending ? <p role="status" className="text-sm text-muted-foreground">Cargando catálogo de ejercicios…</p> : definitions.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage(definitions.error)}</p> : <>
      <p className="text-sm">{results.length} resultados</p>
      {!results.length ? <p className="text-sm text-muted-foreground">{search.trim() ? 'No hay ejercicios que coincidan.' : 'Todavía no hay ejercicios en el catálogo.'}</p> : <ul aria-label="Ejercicios disponibles" className="divide-y rounded-md border bg-white">{results.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE).map(exercise => <li key={exercise.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 break-words"><h3 className="font-medium">{exercise.name}</h3>{exercise.primaryMuscle ? <p className="mt-1 text-sm text-muted-foreground">{exercise.primaryMuscle}</p> : null}<p className="text-sm text-muted-foreground">{patterns.data?.find(pattern => pattern.id === exercise.movementPatternId)?.name ?? 'Sin patrón'}</p></div>
        {canManage ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={formOpen || busy || Boolean(retirement)} onClick={() => openForm(exercise)}>Editar</Button><Button type="button" variant="ghost" disabled={formOpen || busy || Boolean(retirement)} onClick={() => { setFeedback(null); retire.mutate({ id: exercise.id, confirmActiveRoutineImpact: false }); }}>Retirar</Button></div> : null}
      </li>)}</ul>}
    </>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Página {currentPage} de {pages}</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div></div>
      </div></div>
    {retire.isError && !retireNeedsConfirmation && (retire.error as CatalogError).code !== 'SALA_EXERCISE_IN_ROUTINE_TEMPLATE' ? <p role="alert" className="text-sm text-red-700">{errorMessage(retire.error)}</p> : null}
    {(retire.error as CatalogError | null)?.code === 'SALA_EXERCISE_IN_ROUTINE_TEMPLATE' ? <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>No se puede retirar el ejercicio</strong><p>Este ejercicio está incluido en una rutina preestablecida. Para retirarlo, primero tenés que quitarlo de esa rutina.</p></div> : null}
    {patternDelete.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage(patternDelete.error)}</p> : null}
    {patternToDelete ? <div role="alertdialog" aria-label="Confirmar eliminación de patrón" className="space-y-3 rounded-md border bg-white p-4"><p>¿Eliminar el patrón «{patternToDelete.name}»?</p><p className="text-sm">Los ejercicios asociados pasarán automáticamente a «Sin patrón». No se eliminarán ejercicios ni se modificarán rutinas.</p><div className="flex gap-2"><Button type="button" variant="secondary" disabled={patternDelete.isPending} onClick={() => setPatternToDelete(null)}>Cancelar</Button><Button type="button" disabled={patternDelete.isPending} onClick={() => patternDelete.mutate(patternToDelete.id)}>{patternDelete.isPending ? 'Eliminando…' : 'Eliminar patrón'}</Button></div></div> : null}
    {retirement ? <div role="alertdialog" aria-label="Confirmar retiro" className="space-y-3 rounded-md border bg-white p-4">
      <p className="text-sm">Este ejercicio se utiliza en {retirement.activeRoutines} Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={retire.isPending} onClick={() => retire.mutate({ id: retirement.id, confirmActiveRoutineImpact: true })}>Confirmar retiro</Button><Button type="button" variant="secondary" disabled={retire.isPending} onClick={() => { setRetirement(null); retire.reset(); }}>Cancelar retiro</Button></div>
    </div> : null}
  </section>;
}
