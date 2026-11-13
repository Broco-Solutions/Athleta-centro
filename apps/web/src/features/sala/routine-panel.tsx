'use client';

import { RoutinePrintButton } from './routine-print';
import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import type { UpdateActiveRoutineExercisesDto, UpdateScheduledRoutineDto, ReplaceRoutineDto } from '@athleta/api-client';
import { ActiveRoutineExercisesEditor, activeRoutineDraft, activeDraftToInput, type ActiveDayDraft, RoutineDaysEditor, RoutineContentSummary, copyRoutineDays, routineDaysToDraft, draftToRoutineDays, newDay, errorMessage, type EditingDay, type RoutineDay, type ExerciseDefinition, type MovementPattern, type RoutineTemplate } from './routine-editor';
import { MonthlyRoutineHistory, TrainingRecordHistory } from './training-record-history';
import type { TrainingHistoryApi } from './training-record-api';
export type { ExerciseDefinition, RoutineDay, RoutineExercise, RoutineTemplate } from './routine-editor';

export type Routine = { cancelledAt?: string | null; hasTrainingRecords?: boolean; id: string; personId: string; salaParticipationId: string; status: 'ACTIVE' | 'HISTORICAL' | 'SCHEDULED'; effectiveFrom: string; effectiveUntil: string | null; version: number; createdAt?: string; days: RoutineDay[] };
export type RoutineInput = ReplaceRoutineDto;

/** Operations use the generated client through the workspace adapter. */
export type RoutineApi = {
  updateActiveExercises: (id: string, input: UpdateActiveRoutineExercisesDto, options: RequestInit) => Promise<unknown>;
  updateScheduled: (id: string, input: UpdateScheduledRoutineDto, options: RequestInit) => Promise<unknown>;
  removeActive: (id: string, options: RequestInit) => Promise<unknown>;
  cancelScheduled: (id: string, options: RequestInit) => Promise<unknown>;
  training: TrainingHistoryApi;
  list: (personId: string, options: RequestInit) => Promise<Routine[]>;
  templates: (options: RequestInit) => Promise<RoutineTemplate[]>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  patterns: (options: RequestInit) => Promise<MovementPattern[]>;
  create: (input: RoutineInput, options: RequestInit) => Promise<unknown>;
  replace: (routineId: string, input: RoutineInput, options: RequestInit) => Promise<unknown>;
  duplicate: (routineId: string, effectiveFrom: string, options: RequestInit) => Promise<unknown>;

};

type PrintPerson = { birthDate?: string | null; sport?: string | null };
type PrintParticipation = { id: string; objective?: string | null };

export function RoutinePanel({ printPerson, printParticipations, personName, personId, participationId, csrfToken, api, canManage }: { printPerson?: PrintPerson; printParticipations?: PrintParticipation[]; personName: string; personId: string; participationId: string; csrfToken: string; api: RoutineApi; canManage: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const operationalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [effectiveFrom, setEffectiveFrom] = useState(operationalToday);
  const confirmation = () => effectiveFrom > operationalToday() ? `Rutina programada desde el ${effectiveFrom.split('-').reverse().join('/')}.` : 'Rutina asignada correctamente.';
  const [selectingTemplate, setSelectingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoutineTemplate | null>(null);
  const [personalizing, setPersonalizing] = useState(false);
  const [addedDays, setAddedDays] = useState<EditingDay[]>([]);
  const removalPending = useRef(false);
  const [removing, setRemoving] = useState<Routine | null>(null);
  const [activeDraft, setActiveDraft] = useState<ActiveDayDraft[] | null>(null);
  const [scheduledDraft, setScheduledDraft] = useState<{ routine: Routine; date: string; days: EditingDay[] } | null>(null);
  const [cancelling, setCancelling] = useState<Routine | null>(null);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<EditingDay[]>(() => [newDay()]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [routineToReuse, setRoutineToReuse] = useState<Routine | null>(null);
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: () => api.list(personId, options), enabled: Boolean(personId) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options), enabled: canManage });
  const patterns = useQuery({ queryKey: ['sala-movement-patterns'], queryFn: () => api.patterns(options), enabled: canManage });
  const templates = useQuery({ queryKey: ['sala-routine-templates'], queryFn: () => api.templates(options), enabled: canManage && selectingTemplate });
  const active = routines.data?.find((routine) => routine.status === 'ACTIVE');
  const scheduled = routines.data?.filter(routine => routine.status === 'SCHEDULED').sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version) ?? [];
  const historical = routines.data?.filter((routine) => routine.status === 'HISTORICAL') ?? [];
  const refreshRoutines = () => queryClient.invalidateQueries({ queryKey: ['sala-routines', personId] });
  const updateExercises = useMutation({
    mutationFn: () => api.updateActiveExercises(active!.id, { days: [...activeDraftToInput(activeDraft!).days, ...draftToRoutineDays(addedDays).map(day => ({ ...day, name: day.name ?? '' }))] }, options),
    onSuccess: async () => { setActiveDraft(null); setFeedback('Ejercicios actualizados correctamente. Los pesos registrados se conservaron.'); await refreshRoutines(); await queryClient.invalidateQueries({ queryKey: ['sala-training-records', personId] }); },
  });
  const updateScheduled = useMutation({
    mutationFn: () => api.updateScheduled(scheduledDraft!.routine.id, { effectiveFrom: scheduledDraft!.date, ...(scheduledDraft!.routine.hasTrainingRecords ? {} : { days: draftToRoutineDays(scheduledDraft!.days) }) }, options),
    onSuccess: async () => { setFeedback(scheduledDraft!.date === operationalToday() ? 'Rutina activada correctamente.' : 'Rutina programada actualizada correctamente.'); setScheduledDraft(null); await refreshRoutines(); },
  });
  const removeActive = useMutation({
    onSettled: () => { removalPending.current = false; },
    mutationFn: () => api.removeActive(removing!.id, options),
    onSuccess: async () => { setRemoving(null); setActiveDraft(null); setFeedback('Rutina quitada correctamente. El historial se conservó.'); await refreshRoutines(); await queryClient.invalidateQueries({ queryKey: ['sala', 'students'] }); await queryClient.invalidateQueries({ queryKey: ['sala-dashboard'] }); },
  });
  const cancelScheduled = useMutation({
    mutationFn: () => api.cancelScheduled(cancelling!.id, options),
    onSuccess: async () => { setCancelling(null); setFeedback('Programación eliminada correctamente.'); await refreshRoutines(); },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, effectiveFrom, days: draftToRoutineDays(days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setEditing(false);  setDays([newDay()]); setFeedback(confirmation()); await refreshRoutines(); },
  });
  const assign = useMutation({
    mutationFn: async (template: RoutineTemplate) => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, effectiveFrom, days: copyRoutineDays(template.days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setSelectingTemplate(false); setSelectedTemplate(null); setFeedback(confirmation()); await refreshRoutines(); },
  });
  const reuseRoutine = useMutation({
    mutationFn: (id: string) => api.duplicate(id, effectiveFrom, options),
    onSuccess: async () => { setRoutineToReuse(null); setFeedback(confirmation()); await refreshRoutines(); },
  });
  const startEditing = () => {
    mutation.reset(); setFeedback(null); setEffectiveFrom(operationalToday());

    setPersonalizing(false); setSelectingTemplate(false);
    setDays(active?.days.length ? routineDaysToDraft(active.days) : [newDay()]);
    setEditing(true);
  };
  const dateField = (pending: boolean) => <div className="my-4"><label className="block text-sm font-medium">Fecha de inicio<input type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} disabled={pending} className="mt-2 block min-h-11 w-full max-w-xs rounded-md border bg-white px-3 text-base"/></label><p className="mt-2 text-sm text-muted-foreground">Desde esta fecha el alumno comenzará a utilizar la nueva rutina.</p></div>;
  const actionErrors = [mutation.error, assign.error, reuseRoutine.error, updateExercises.error, updateScheduled.error, cancelScheduled.error, removeActive.error].filter(Boolean);
  return <section aria-labelledby="routine-heading" className="mt-4 rounded-md border bg-surface-muted p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="routine-heading" className="font-semibold">Rutinas del alumno</h3><p className="text-sm text-muted-foreground">Planificación de entrenamiento vigente e histórica.</p></div>{canManage && participationId ? <div className="flex flex-wrap gap-2"><Button type="button" variant={active ? 'secondary' : 'primary'} onClick={startEditing} disabled={routines.isLoading || routines.isError || editing || Boolean(routineToReuse) || reuseRoutine.isPending || assign.isPending}>{active ? 'Asignar nueva rutina' : 'Crear desde cero'}</Button><Button type="button" variant={active ? 'ghost' : 'secondary'} disabled={routines.isLoading || routines.isError || editing || Boolean(routineToReuse) || reuseRoutine.isPending || assign.isPending} onClick={() => { setEffectiveFrom(operationalToday()); setSelectingTemplate(true); setSelectedTemplate(null); setFeedback(null); assign.reset(); }}>Usar preestablecida</Button></div> : null}</div>
    {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
    {actionErrors.map((error, index) => <p role="alert" key={index} className="mt-3 text-sm text-red-700">{errorMessage(error)}</p>)}
    {routines.isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando rutina…</p> : null}
    {routines.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(routines.error)}</p> : null}
    {!routines.isLoading && !routines.isError && !active ? <div className="mt-4 rounded-md border bg-white p-4"><p className="font-medium">No hay una rutina activa.</p><p className="mt-1 text-sm text-muted-foreground">Creá una rutina nueva o elegí una preestablecida para este alumno.</p></div> : null}
    {active ? <h4 className="mt-4 font-semibold">Rutina actual</h4> : null}
    {active ? <RoutineSummary printPerson={printPerson} printParticipations={printParticipations} personName={personName} routine={active} actions={active && canManage && participationId ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={updateExercises.isPending || activeDraft !== null} onClick={() => { updateExercises.reset(); setFeedback(null); setAddedDays([]); try { setActiveDraft(activeRoutineDraft(active.days)); } catch (error) { setFeedback(errorMessage(error)); } }}>Editar ejercicios</Button><Button variant="ghost" disabled={removeActive.isPending || activeDraft !== null} onClick={() => { removeActive.reset(); setRemoving(active); }}>Quitar rutina</Button></div> : null} training={api.training} definitions={definitions.data ?? []} reusing={reuseRoutine.isPending}/> : null}
    {active && activeDraft ? <section aria-label="Editar ejercicios" className="mt-4 min-w-0 rounded-md border bg-white p-4"><h4 className="font-semibold">Editar ejercicios — Rutina {active.version}</h4><p className="mt-2 text-sm">Esta modificación conserva la rutina y los pesos registrados.</p>
      <ActiveRoutineExercisesEditor days={activeDraft} onChange={setActiveDraft} disabled={updateExercises.isPending} definitions={definitions.data ?? []} catalogLoading={definitions.isLoading} catalogError={definitions.isError} patterns={patterns.data ?? []} patternsLoading={patterns.isLoading} patternsError={patterns.isError}/>
      <RoutineDaysEditor days={addedDays} dayOffset={activeDraft.length} allowEmpty onChange={setAddedDays} disabled={updateExercises.isPending} definitions={definitions.data ?? []} catalogLoading={definitions.isLoading} catalogError={definitions.isError} patterns={patterns.data ?? []} patternsLoading={patterns.isLoading} patternsError={patterns.isError}/>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={updateExercises.isPending} onClick={() => setActiveDraft(null)}>Cancelar</Button><Button disabled={updateExercises.isPending} onClick={() => updateExercises.mutate()}>Guardar cambios</Button></div>
    </section> : null}
    {scheduled.length ? <section className="mt-4" aria-label="Próxima rutina"><h4 className="font-semibold">Próxima rutina</h4>{scheduled.map(routine => <RoutineSummary printPerson={printPerson} printParticipations={printParticipations} key={routine.id} personName={personName} routine={routine} training={api.training} definitions={definitions.data ?? []} reusing={reuseRoutine.isPending} actions={canManage ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { updateScheduled.reset(); setScheduledDraft({ routine, date: routine.effectiveFrom, days: routineDaysToDraft(routine.days) }); }}>Editar</Button><Button variant="ghost" onClick={() => { cancelScheduled.reset(); setCancelling(routine); }}>Eliminar rutina programada</Button></div> : null}/>)}</section> : null}
    {scheduledDraft ? <section aria-label="Editar programación" className="mt-4 min-w-0 rounded-md border bg-white p-4"><h4 className="font-semibold">Editar Rutina {scheduledDraft.routine.version}</h4><label className="mt-3 block text-sm">Fecha de inicio<input type="date" className="mt-2 block min-h-11 w-full max-w-xs rounded-md border px-3" value={scheduledDraft.date} disabled={updateScheduled.isPending} onChange={e => setScheduledDraft({ ...scheduledDraft, date: e.target.value })}/></label>
      {scheduledDraft.routine.hasTrainingRecords ? <><p className="mt-2 text-sm">Los pesos registrados se conservarán. Solo podés modificar la fecha.</p><RoutineContentSummary days={scheduledDraft.routine.days}/></> : <RoutineDaysEditor days={scheduledDraft.days} onChange={days => setScheduledDraft({ ...scheduledDraft, days })} disabled={updateScheduled.isPending} definitions={definitions.data ?? []} catalogLoading={definitions.isLoading} catalogError={definitions.isError} patterns={patterns.data ?? []} patternsLoading={patterns.isLoading} patternsError={patterns.isError}/>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={updateScheduled.isPending} onClick={() => setScheduledDraft(null)}>Cancelar</Button><Button disabled={updateScheduled.isPending || !scheduledDraft.date} onClick={() => updateScheduled.mutate()}>Guardar cambios</Button></div>
    </section> : null}
    {removing ? <section role="alertdialog" aria-labelledby="remove-routine-title" className="mt-4 rounded-md border bg-white p-4"><h4 id="remove-routine-title" className="font-semibold">¿Quitar la rutina vigente?</h4><p className="mt-2">El alumno quedará sin rutina activa. Los ejercicios y pesos registrados se conservarán en el historial.</p>{scheduled.length ? <p className="mt-2">La próxima rutina programada se conservará y comenzará en la fecha indicada.</p> : null}<div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={removeActive.isPending} onClick={() => setRemoving(null)}>Cancelar</Button><Button disabled={removeActive.isPending} onClick={() => { if (!removalPending.current) { removalPending.current = true; removeActive.mutate(); } }}>Confirmar</Button></div></section> : null}
    {cancelling ? <section role="alertdialog" aria-labelledby="cancel-program-title" className="mt-4 rounded-md border bg-white p-4"><h4 id="cancel-program-title" className="font-semibold">¿Eliminar la programación de la Rutina {cancelling.version}?</h4><p className="mt-2">Esta rutina todavía no comenzó. Al eliminarla, dejará de estar programada.</p><p className="mt-2">Estaba prevista para comenzar el {cancelling.effectiveFrom.split('-').reverse().join('/')}.</p><p className="mt-2">{active ? 'La rutina vigente del alumno no se modificará.' : 'El alumno continuará sin rutina hasta que se le asigne otra.'}</p>{cancelling.hasTrainingRecords ? <p className="mt-2">Los pesos registrados se conservarán en el historial.</p> : null}<div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={cancelScheduled.isPending} onClick={() => setCancelling(null)}>Volver</Button><Button disabled={cancelScheduled.isPending} onClick={() => cancelScheduled.mutate()}>Eliminar rutina programada</Button></div></section> : null}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Registros anteriores</summary><TrainingRecordHistory key={personId} legacyOnly api={api.training} queryKey={['sala-training-records', personId]}/></details>
    {historical.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Rutinas históricas ({historical.length})</summary><div className="mt-2 grid gap-2">{historical.map((routine) => <RoutineSummary printPerson={printPerson} printParticipations={printParticipations} personName={personName} key={routine.id} routine={routine} training={api.training} definitions={definitions.data ?? []} onReuse={canManage && participationId && !editing && !selectingTemplate && !routineToReuse ? () => { setFeedback(null); reuseRoutine.reset(); setEffectiveFrom(operationalToday()); setRoutineToReuse(routine); } : undefined} reusing={reuseRoutine.isPending}/>)}</div></details> : null}
    {routineToReuse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reuse-routine-title" className="mt-4 rounded-md border bg-white p-4"><h4 id="reuse-routine-title" className="font-semibold">Usar nuevamente esta rutina</h4><p className="mt-2 text-sm">Se creará una nueva versión utilizando estos ejercicios.</p>{dateField(reuseRoutine.isPending)}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={reuseRoutine.isPending} onClick={() => { setRoutineToReuse(null); reuseRoutine.reset(); }}>Cancelar</Button><Button type="button" disabled={reuseRoutine.isPending || !effectiveFrom} onClick={() => reuseRoutine.mutate(routineToReuse.id)}>{reuseRoutine.isPending ? 'Activando…' : 'Usar nuevamente'}</Button></div></div> : null}
    {canManage && selectingTemplate ? <div className="mt-4 rounded-md border bg-white p-4">
      {selectedTemplate ? <div role="region" aria-label="Vista previa de preestablecida"><h4 className="font-semibold">{selectedTemplate.name} — {selectedTemplate.days.length} días</h4><RoutineContentSummary days={selectedTemplate.days}/>
        {selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false)) ? <p className="mt-3 text-sm">Esta rutina contiene ejercicios que ya no están disponibles. Editala para reemplazarlos o quitarlos.</p> : null}
        {dateField(assign.isPending)}<div className="mt-4 flex gap-2"><Button type="button" disabled={assign.isPending || !effectiveFrom || selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false))} onClick={() => assign.mutate(selectedTemplate)}>Asignar rutina</Button><RoutinePrintButton days={selectedTemplate.days} templateName={selectedTemplate.name} disabled={assign.isPending}/><Button type="button" variant="secondary" disabled={assign.isPending} onClick={() => { setDays(routineDaysToDraft(selectedTemplate.days)); setPersonalizing(true); setSelectingTemplate(false); setEditing(true); mutation.reset(); }}>Editar</Button><Button type="button" variant="ghost" disabled={assign.isPending} onClick={() => { setSelectedTemplate(null); assign.reset(); }}>Volver</Button></div></div> : <>
        <h4 className="font-semibold">Usar preestablecida</h4>{templates.isLoading ? <p role="status">Cargando rutinas preestablecidas…</p> : templates.isError ? <p role="alert">{errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p>No hay rutinas preestablecidas disponibles. Podés crear la rutina desde cero.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{templates.data?.map((template) => <li key={template.id}><Button type="button" variant="secondary" className="w-full justify-start" onClick={() => setSelectedTemplate(template)}>{template.name}</Button></li>)}</ul>}
        <Button type="button" variant="ghost" onClick={() => setSelectingTemplate(false)}>Volver</Button>
      </>}
    </div> : null}
    {canManage && editing ? <div className="mt-4 rounded-lg border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-xl font-semibold">{personalizing ? 'Personalizar rutina' : active ? 'Asignar nueva rutina' : 'Crear rutina desde cero'}</h4><p className="mt-1 text-sm text-muted-foreground">Organizá los días y completá los ejercicios del alumno.</p></div></div>
      {dateField(mutation.isPending)}
      <RoutineDaysEditor days={days} definitions={[...(definitions.data ?? []), ...((selectedTemplate ?? active)?.days.flatMap((day) => day.exercises.filter((entry) => entry.exerciseDefinition?.isActive === false).map((entry) => ({ id: entry.exerciseDefinitionId, name: entry.exerciseDefinition!.name, primaryMuscle: '', isActive: false }))) ?? [])]} catalogLoading={definitions.isLoading} catalogError={definitions.isError} patterns={patterns.data ?? []} patternsLoading={patterns.isLoading} patternsError={patterns.isError} disabled={mutation.isPending} onChange={setDays}/>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Los cambios se aplican al guardar.</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setEditing(false);  }} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => { setFeedback(null); mutation.mutate(); }} disabled={mutation.isPending || !effectiveFrom}>{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></div></div>
</div> : null}
  </section>;
}

function RoutineSummary({ actions, printPerson, printParticipations, personName, routine, training, definitions, onReuse, reusing }: { actions?: React.ReactNode; printPerson?: PrintPerson | undefined; printParticipations?: PrintParticipation[] | undefined; training: TrainingHistoryApi; personName: string; routine: Routine; definitions: ExerciseDefinition[]; onReuse?: (() => void) | undefined; reusing: boolean }): React.JSX.Element {
  const [showWeights, setShowWeights] = useState(false);
  const dateLabel = (value: string) => value.split('-').reverse().join('/');
  const lastDay = routine.effectiveUntil ? new Date(`${routine.effectiveUntil}T00:00:00Z`) : null;
  lastDay?.setUTCDate(lastDay.getUTCDate() - 1);
  return <article className="mt-3 min-w-0 rounded-md border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Rutina {routine.version}</h4><span className="text-sm">{routine.status === 'ACTIVE' ? 'Vigente' : routine.status === 'SCHEDULED' ? 'Programada' : 'Histórica'}</span><RoutinePrintButton days={routine.days} definitions={definitions} studentName={personName} studentDetails={printPerson} objective={printParticipations?.find(item => item.id === routine.salaParticipationId)?.objective} effectiveFrom={routine.effectiveFrom} effectiveUntil={routine.effectiveUntil} status={routine.status} version={routine.version} disabled={reusing}/>{onReuse ? <Button type="button" variant="secondary" disabled={reusing} onClick={onReuse}>Usar nuevamente</Button> : null}</div>
    <p className="mt-2 text-sm">{routine.effectiveUntil === routine.effectiveFrom ? `Reemplazada el ${dateLabel(routine.effectiveFrom)}` : routine.status === 'SCHEDULED' ? `Comienza el ${dateLabel(routine.effectiveFrom)}` : lastDay ? `${dateLabel(routine.effectiveFrom)} – ${dateLabel(lastDay.toISOString().slice(0, 10))}` : `Desde el ${dateLabel(routine.effectiveFrom)}`}</p>
    <p className="mt-1 text-sm text-muted-foreground">{routine.days.length} días · {routine.days.reduce((total, day) => total + day.exercises.length, 0)} ejercicios</p>
    {routine.status === 'SCHEDULED' ? <p className="mt-2 text-sm">Esta rutina todavía no está activa. Se activará el {routine.effectiveFrom.split('-').reverse().join('/')}.</p> : null}
    <details className="mt-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Ver ejercicios</summary><RoutineContentSummary days={routine.days} definitions={definitions}/></details>
    <Button variant="secondary" aria-expanded={showWeights} onClick={() => setShowWeights(!showWeights)}>Ver pesos</Button>
    {actions}
    {showWeights ? <MonthlyRoutineHistory routine={routine} api={training}/> : null}
  </article>;
}
