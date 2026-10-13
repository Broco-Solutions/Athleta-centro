'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { createSalaRoutineTemplate, updateSalaRoutineTemplate, deleteSalaRoutineTemplate, listSalaRoutineTemplates, listSalaExerciseDefinitions, createSalaExerciseDefinition, type RoutineTemplateDto, type ExerciseDefinitionDto } from '@athleta/api-client';
import { DayEditor, RoutineContentSummary, draftToRoutineDays, routineDaysToDraft, newDay, fieldClass, errorMessage, type EditingDay, type RoutineTemplate, type ExerciseDefinition } from './routine-editor';

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
const templateApi: RoutineTemplateApi = {
  list: async (options) => checkedBody(await listSalaRoutineTemplates(options)) as RoutineTemplate[],
  create: async (input, options) => checkedBody(await createSalaRoutineTemplate(input, options)),
  update: async (id, input, options) => checkedBody(await updateSalaRoutineTemplate(id, input, options)),
  delete: async (id, options) => checkedBody(await deleteSalaRoutineTemplate(id, options)),
  exercises: async (options) => checkedBody(await listSalaExerciseDefinitions(options)) as ExerciseDefinition[],
  createExercise: async (input, options) => {
    const created = checkedBody(await createSalaExerciseDefinition(input, options)) as Partial<ExerciseDefinition> | undefined;
    if (!created?.id || typeof created.name !== 'string' || typeof created.primaryMuscle !== 'string' || typeof created.isActive !== 'boolean') throw new Error('La respuesta no contiene el ejercicio creado.');
    return created as ExerciseDefinition;
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
  const startEditing = (template: RoutineTemplate | null) => {
    setSource(template); setDays(template ? routineDaysToDraft(template.days) : [newDay()]); reset({ name: template?.name ?? '' });
    setEditing(true); setFeedback(null); setValidationError(null); save.reset();
  };
  const submit = handleSubmit((values) => {
    const name = nameSchema.safeParse(values.name);
    if (!name.success) { setValidationError(name.error.issues[0]?.message ?? 'Revisá el Nombre.'); return; }
    try { const input = { name: name.data, days: draftToRoutineDays(days) }; setValidationError(null); save.mutate(input); }
    catch (error) { setValidationError(errorMessage(error)); }
  });
  const editorDefinitions = [...(definitions.data ?? []), ...(source?.days.flatMap((day) => day.exercises.filter((entry) => entry.exerciseDefinition?.isActive === false).map((entry) => ({ id: entry.exerciseDefinitionId, name: entry.exerciseDefinition!.name, primaryMuscle: '', isActive: false }))) ?? [])];

  return <section className="space-y-4">
    <Button type="button" disabled={editing || remove.isPending} onClick={() => startEditing(null)}>Nueva rutina preestablecida</Button>
    {feedback ? <p role="status">{feedback}</p> : null}
    {templates.isLoading ? <p role="status">Cargando rutinas preestablecidas…</p> : templates.isError ? <p role="alert">{errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay rutinas preestablecidas.</p> : null}
    {remove.error ? <p role="alert">{errorMessage(remove.error)}</p> : null}
    {editing ? <div className="rounded-md border bg-white p-4">
      <h2 className="font-semibold">{source ? 'Editar rutina preestablecida' : 'Nueva rutina preestablecida'}</h2>
      <label className="mt-3 block text-sm">Nombre de la preestablecida<input aria-label="Nombre de la preestablecida" className={fieldClass} maxLength={120} {...register('name')} disabled={save.isPending}/></label>
      {days.map((day, index) => <DayEditor key={day.key} day={day} index={index} definitions={editorDefinitions} catalogLoading={definitions.isLoading} catalogError={definitions.isError} onCreateExercise={createInlineExercise} disabled={save.isPending} canRemove={days.length > 1} onRemove={() => setDays((current) => current.filter((item) => item.key !== day.key))} onChange={(next) => setDays((current) => current.map((item) => item.key === next.key ? next : item))}/>)}
      <Button type="button" variant="secondary" className="mt-3" disabled={save.isPending} onClick={() => setDays((current) => [...current, newDay(`Día ${current.length + 1}`)])}>Agregar día</Button>
      {validationError || save.error ? <p role="alert" className="mt-3 text-sm text-red-700">{validationError ?? errorMessage(save.error)}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => setEditing(false)}>Cancelar</Button><Button type="button" disabled={save.isPending} onClick={() => void submit()}>{save.isPending ? 'Guardando…' : 'Guardar preestablecida'}</Button></div>
    </div> : <div className="grid gap-4">{templates.data?.map((template) => <article key={template.id} aria-label={template.name} className="rounded-md border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{template.name}</h2><div className="flex gap-2"><Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => startEditing(template)}>Editar</Button><Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => { setDeleting(template); setFeedback(null); remove.reset(); }}>Eliminar</Button></div></div><RoutineContentSummary days={template.days}/></article>)}</div>}
    {deleting ? <div role="alertdialog" aria-label="Eliminar rutina preestablecida" className="rounded-md border bg-white p-4"><p>¿Eliminar esta rutina preestablecida? Las rutinas ya asignadas a alumnos no se modificarán.</p><div className="mt-3 flex gap-2"><Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>Confirmar eliminación</Button><Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => { setDeleting(null); remove.reset(); }}>Cancelar eliminación</Button></div></div> : null}
  </section>;
}
