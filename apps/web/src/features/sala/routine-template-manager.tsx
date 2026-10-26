'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { createSalaRoutineTemplate, updateSalaRoutineTemplate, deleteSalaRoutineTemplate, listSalaRoutineTemplates, listSalaExerciseDefinitions, createSalaExerciseDefinition, type RoutineTemplateDto, type ExerciseDefinitionDto } from '@athleta/api-client';
import { RoutineDaysEditor, RoutineContentSummary, draftToRoutineDays, routineDaysToDraft, newDay, fieldClass, errorMessage, type EditingDay, type RoutineTemplate, type ExerciseDefinition } from './routine-editor';

export type RoutineTemplateApi = {
  list: (options: RequestInit) => Promise<RoutineTemplate[]>;
  create: (input: RoutineTemplateDto, options: RequestInit) => Promise<unknown>;
  update: (id: string, input: RoutineTemplateDto, options: RequestInit) => Promise<unknown>;
  delete: (id: string, options: RequestInit) => Promise<unknown>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  createExercise: (input: ExerciseDefinitionDto, options: RequestInit) => Promise<ExerciseDefinition>;
};

function checkedBody(response: { status: number; data: unknown }): unknown {
  const body = response.data as { data?: unknown; message?: string } | null;
  if (response.status >= 400) throw new Error(body?.message ?? 'No se pudo completar la operación.');
  return body?.data;
}
function checkedData<T>(response: { status: number; data: { data: T } }): T {
  checkedBody(response);
  return response.data.data;
}
const templateApi: RoutineTemplateApi = {
  list: async (options) => checkedData(await listSalaRoutineTemplates(options)),
  create: async (input, options) => checkedBody(await createSalaRoutineTemplate(input, options)),
  update: async (id, input, options) => checkedBody(await updateSalaRoutineTemplate(id, input, options)),
  delete: async (id, options) => checkedBody(await deleteSalaRoutineTemplate(id, options)),
  exercises: async (options) => checkedData(await listSalaExerciseDefinitions(options)),
  createExercise: async (input, options) => {
    const created = checkedData(await createSalaExerciseDefinition(input, options));
    if (!created?.id || typeof created.name !== 'string' || typeof created.isActive !== 'boolean') throw new Error('La respuesta no contiene el ejercicio creado.');
    return created;
  },
};
const nameSchema = z.string().trim().min(1, 'El Nombre es obligatorio.').max(120, 'El Nombre admite hasta 120 caracteres.');

export function RoutineTemplateManager({ csrfToken, api = templateApi }: { csrfToken: string; api?: RoutineTemplateApi }): React.JSX.Element {
  const client = useQueryClient();
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const templates = useQuery({ queryKey: ['sala-routine-templates'], queryFn: () => api.list(options) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options) });
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<RoutineTemplate | null>(null);
  const [days, setDays] = useState<EditingDay[]>(() => [newDay()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<RoutineTemplate | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { register, reset, handleSubmit } = useForm<{ name: string }>({ defaultValues: { name: '' } });
  const refresh = () => client.invalidateQueries({ queryKey: ['sala-routine-templates'] });
  const save = useMutation({
    mutationFn: (input: RoutineTemplateDto) => source ? api.update(source.id, input, options) : api.create(input, options),
    onSuccess: async () => { setEditing(false); setSource(null); setFeedback('Rutina preestablecida guardada correctamente.'); await refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(id, options),
    onSuccess: async () => { setDeleting(null); setFeedback('Rutina preestablecida eliminada correctamente.'); await refresh(); },
  });
  const createInlineExercise = async (input: ExerciseDefinitionDto): Promise<ExerciseDefinition> => {
    const created = await api.createExercise(input, options);
    await client.cancelQueries({ queryKey: ['sala-exercise-definitions'] });
    client.setQueryData<ExerciseDefinition[]>(['sala-exercise-definitions'], (current = []) => [...current.filter((item) => item.id !== created.id), created]);
    void client.invalidateQueries({ queryKey: ['sala-exercise-definitions'] });
    return created;
  };
  const startEditing = (template: RoutineTemplate | null, duplicate = false) => {
    setSource(duplicate ? null : template); setDays(template ? routineDaysToDraft(template.days) : [newDay()]); reset({ name: duplicate && template ? `Copia de ${template.name}`.slice(0, 120) : template?.name ?? '' });
    setEditing(true); setFeedback(null); setValidationError(null); save.reset();
  };
  const submit = handleSubmit((values) => {
    const name = nameSchema.safeParse(values.name);
    if (!name.success) { setValidationError(name.error.issues[0]?.message ?? 'Revisá el Nombre.'); return; }
    try { const input = { name: name.data, days: draftToRoutineDays(days) }; setValidationError(null); save.mutate(input); }
    catch (error) { setValidationError(errorMessage(error)); }
  });
  const editorDefinitions = [...(definitions.data ?? []), ...(source?.days.flatMap((day) => day.exercises.filter((entry) => entry.exerciseDefinition?.isActive === false).map((entry) => ({ id: entry.exerciseDefinitionId, name: entry.exerciseDefinition!.name, primaryMuscle: '', isActive: false }))) ?? [])];
  const selected = templates.data?.find((template) => template.id === selectedId) ?? templates.data?.[0];
  const searchTerm = search.trim().toLocaleLowerCase('es');
  const visibleTemplates = (templates.data ?? []).filter((template) => template.name.toLocaleLowerCase('es').includes(searchTerm));
  const exerciseCount = (template: RoutineTemplate) => template.days.reduce((count, day) => count + day.exercises.length, 0);
  const openDelete = (template: RoutineTemplate) => { setDeleting(template); setFeedback(null); remove.reset(); };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{templates.data?.length ?? 0} {templates.data?.length === 1 ? 'rutina preestablecida' : 'rutinas preestablecidas'}</p><p className="text-sm text-muted-foreground">Elegí una rutina para ver sus días y ejercicios.</p></div><Button type="button" disabled={editing || remove.isPending} onClick={() => startEditing(null)}>Nueva rutina preestablecida</Button></div>
    {feedback ? <p role="status">{feedback}</p> : null}
    {templates.isLoading ? <p role="status">Cargando rutinas preestablecidas…</p> : templates.isError ? <p role="alert">{errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay rutinas preestablecidas.</p> : null}
    {remove.error ? <p role="alert">{errorMessage(remove.error)}</p> : null}
    {editing ? <div className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{source ? 'Editar rutina preestablecida' : 'Nueva rutina preestablecida'}</h2><p className="mt-1 text-sm text-muted-foreground">Organizá los días y agregá los ejercicios del plan.</p></div></div>
      <div className="mt-4 grid gap-3 rounded-md bg-surface-muted p-4 sm:grid-cols-[minmax(16rem,1fr)_auto] sm:items-end"><label className="text-sm font-medium">Nombre de la rutina<input aria-label="Nombre de la preestablecida" className={`${fieldClass} mt-1`} maxLength={120} {...register('name')} disabled={save.isPending}/></label><p className="text-sm text-muted-foreground">{days.length} {days.length === 1 ? 'día' : 'días'} · {days.reduce((count, day) => count + day.exercises.length, 0)} ejercicios</p></div>
      <RoutineDaysEditor days={days} definitions={editorDefinitions} catalogLoading={definitions.isLoading} catalogError={definitions.isError} onCreateExercise={createInlineExercise} disabled={save.isPending} onChange={setDays}/>
      {validationError || save.error ? <p role="alert" className="mt-3 text-sm text-red-700">{validationError ?? errorMessage(save.error)}</p> : null}
      <p className="mt-4 text-sm text-muted-foreground">Los cambios se aplican al guardar.</p><div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => setEditing(false)}>Cancelar</Button><Button type="button" disabled={save.isPending} onClick={() => void submit()}>{save.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></div>
    </div> : templates.data?.length ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.34fr)_minmax(0,1fr)]">
      <section aria-label="Lista de rutinas preestablecidas" className="min-w-0 rounded-lg border bg-white p-4"><label className="block text-sm font-medium">Buscar rutina<input className={`${fieldClass} mt-1`} type="search" placeholder="Nombre de la rutina" value={search} onChange={(event) => setSearch(event.target.value)}/></label><p className="mt-3 text-xs text-muted-foreground">{visibleTemplates.length} resultados</p>
        <ul className="mt-2 grid max-h-[28rem] gap-2 overflow-y-auto">{visibleTemplates.map((template) => <li key={template.id}><button type="button" aria-pressed={selected?.id === template.id} onClick={() => setSelectedId(template.id)} className={`w-full rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === template.id ? 'border-primary bg-primary/10' : 'bg-white hover:bg-surface-muted'}`}><span className="block font-medium">{template.name}</span><span className="mt-1 block text-xs text-muted-foreground">{template.days.length} {template.days.length === 1 ? 'día' : 'días'} · {exerciseCount(template)} ejercicios</span></button></li>)}</ul>
        {!visibleTemplates.length ? <p className="mt-3 text-sm text-muted-foreground">No hay rutinas que coincidan.</p> : null}
      </section>
      {selected ? <article aria-label={selected.name} className="min-w-0 rounded-lg border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rutina seleccionada</p><h2 className="mt-1 break-words text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.days.length} {selected.days.length === 1 ? 'día' : 'días'} · {exerciseCount(selected)} ejercicios</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => startEditing(selected, true)}>Duplicar</Button><Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => startEditing(selected)}>Editar</Button><Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => openDelete(selected)}>Eliminar</Button></div></div><RoutineContentSummary days={selected.days}/></article> : null}
    </div> : null}
    {deleting ? <div role="alertdialog" aria-label="Eliminar rutina preestablecida" className="rounded-md border bg-white p-4"><p>¿Eliminar esta rutina preestablecida? Las rutinas ya asignadas a alumnos no se modificarán.</p><div className="mt-3 flex gap-2"><Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>Confirmar eliminación</Button><Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => { setDeleting(null); remove.reset(); }}>Cancelar eliminación</Button></div></div> : null}
  </section>;
}
