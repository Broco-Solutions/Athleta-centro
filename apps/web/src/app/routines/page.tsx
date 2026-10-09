'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSalaExerciseDefinition, createSalaRoutineTemplate, deleteSalaRoutineTemplate, listSalaExerciseDefinitions, listSalaRoutineTemplates, updateSalaRoutineTemplate, type ExerciseDefinitionDto, type RoutineTemplateDto } from '@athleta/api-client';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { DayEditor, RoutineContentSummary, draftToRoutineDays, errorMessage, fieldClass, newDay, routineDaysToDraft, type EditingDay, type ExerciseDefinition, type RoutineTemplate } from '../../features/sala/routine-editor';

function assertResponse(response: { status: number; data: unknown }): void {
  if (response.status < 400) return;
  const body = response.data as { message?: string } | null;
  throw new Error(body?.message || 'No se pudo completar la operación.');
}

function unwrapList<T>(response: { status: number; data: unknown }): T[] {
  assertResponse(response);
  const body = response.data as { data?: unknown } | null;
  if (!Array.isArray(body?.data)) throw new Error('No se pudo completar la operación.');
  return body.data as T[];
}

export default function RoutinesPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const canManage = session.data?.permissions.includes('SALA_ROUTINE_MANAGE') ?? false;
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState<EditingDay[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const options: RequestInit = { credentials: 'include', headers: { 'x-csrf-token': session.data?.csrfToken ?? '' } };
  const templates = useQuery({ queryKey: ['sala-routine-templates'], queryFn: async () => unwrapList<RoutineTemplate>(await listSalaRoutineTemplates({ credentials: 'include' })), enabled: canManage });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: async () => unwrapList<ExerciseDefinition>(await listSalaExerciseDefinitions({ credentials: 'include' })), enabled: canManage && editing });

  const closeEditor = () => { setEditing(false); setTemplateId(null); setName(''); setDays([]); };
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error('No tenés permisos para administrar Rutinas.');
      if (!name.trim() || name.trim().length > 120) throw new Error('El nombre de la rutina es obligatorio y admite hasta 120 caracteres.');
      const input: RoutineTemplateDto = { name: name.trim(), days: draftToRoutineDays(days) };
      assertResponse(templateId ? await updateSalaRoutineTemplate(templateId, input, options) : await createSalaRoutineTemplate(input, options));
      return templateId !== null;
    },
    onSuccess: async (updated) => {
      closeEditor();
      setFeedback(updated ? 'Rutina preestablecida actualizada correctamente.' : 'Rutina preestablecida creada correctamente.');
      await client.invalidateQueries({ queryKey: ['sala-routine-templates'] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!canManage) throw new Error('No tenés permisos para administrar Rutinas.');
      assertResponse(await deleteSalaRoutineTemplate(id, options));
    },
    onSuccess: async () => {
      setFeedback('Rutina preestablecida eliminada correctamente.');
      await client.invalidateQueries({ queryKey: ['sala-routine-templates'] });
    },
  });
  const createExercise = async (input: ExerciseDefinitionDto): Promise<ExerciseDefinition> => {
    if (!canManage) throw new Error('No tenés permisos para administrar Rutinas.');
    const response = await createSalaExerciseDefinition(input, options);
    assertResponse(response);
    // The generated client types the body as void; the controller returns an envelope.
    const created = (response.data as unknown as { data?: Partial<ExerciseDefinition> } | null)?.data;
    if (!created || typeof created.id !== 'string' || !created.id || typeof created.name !== 'string' || typeof created.primaryMuscle !== 'string' || typeof created.isActive !== 'boolean') throw new Error('La respuesta no contiene el ejercicio creado.');
    const definition = created as ExerciseDefinition;
    client.setQueryData<ExerciseDefinition[]>(['sala-exercise-definitions'], (items = []) => [...items.filter((item) => item.id !== definition.id), definition]);
    return definition;
  };
  const busy = save.isPending || remove.isPending;
  const openEditor = (template?: RoutineTemplate) => {
    save.reset(); remove.reset(); setFeedback(null);
    setTemplateId(template?.id ?? null);
    setName(template?.name ?? '');
    setDays(template ? routineDaysToDraft(template.days) : [newDay()]);
    setEditing(true);
  };

  return <WorkspaceShell active="Rutinas">
    {session.isPending ? <p>Cargando rutinas…</p> : !canManage ? <p>No tenés permisos para administrar Rutinas.</p> : <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">Rutinas</h1><p className="mt-1 text-sm text-muted-foreground">Rutinas preestablecidas de Athleta.</p></div>
        <Button onClick={() => openEditor()} disabled={busy || editing}>Nueva rutina</Button>
      </header>
      {feedback ? <p role="status" className="text-sm text-emerald-700">{feedback}</p> : null}
      {remove.error ? <p role="alert" className="text-sm text-red-700">{errorMessage(remove.error)}</p> : null}
      {editing ? <section aria-label="Editor de rutina preestablecida" className="rounded-md border bg-white p-5">
        <label className="text-sm">Nombre de la rutina<input className={fieldClass} maxLength={120} required value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        {days.map((day, index) => <DayEditor key={day.key} day={day} index={index} definitions={definitions.data ?? []} catalogLoading={definitions.isLoading} catalogError={definitions.isError} onCreateExercise={createExercise} disabled={busy} canRemove={days.length > 1} onRemove={() => setDays((items) => items.filter((item) => item.key !== day.key))} onChange={(next) => setDays((items) => items.map((item) => item.key === day.key ? next : item))} />)}
        <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => setDays((items) => [...items, newDay(`Día ${items.length + 1}`)])}>Agregar día</Button>
        {save.error ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(save.error)}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => { closeEditor(); save.reset(); }}>Cancelar</Button><Button disabled={busy} onClick={() => { setFeedback(null); save.mutate(); }}>{save.isPending ? 'Guardando…' : 'Guardar'}</Button></div>
      </section> : null}
      {templates.isLoading ? <p>Cargando rutinas…</p> : templates.isError ? <p role="alert">Error al consultar. {errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p>No hay rutinas preestablecidas.</p> : templates.data?.map((template) => <article key={template.id} className="rounded-md border bg-white p-5">
        <h2 className="text-xl font-semibold">{template.name}</h2>
        <RoutineContentSummary days={template.days} />
        <div className="mt-4 flex gap-2"><Button variant="secondary" disabled={busy || editing} onClick={() => openEditor(template)}>Editar</Button><Button variant="secondary" disabled={busy || editing} onClick={() => { if (window.confirm('¿Eliminar esta rutina preestablecida?')) { setFeedback(null); remove.mutate(template.id); } }}>{remove.isPending && remove.variables === template.id ? 'Eliminando…' : 'Eliminar'}</Button></div>
      </article>)}
    </div>}
  </WorkspaceShell>;
}
