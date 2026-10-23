'use client';

import { PaperDeclarationFields, usePaperDeclaration } from '../health-declaration/paper-declaration-fields';
import React, { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSalaStudentAndSpontaneousOccurrence, createSpontaneousSalaOccurrence, getPersonSalaSpontaneousOptions, joinSalaAndCreateSpontaneousOccurrence, listSalaPlans, listSalaProfessors } from '@athleta/api-client';
import { fetchPeople } from '../people/people-api';
import type { AgendaGroup } from './agenda-panel';
import { GeneralPersonFields, personDefaults, personInput, type PersonValues } from '../people/general-person-form';
import { studentSchema, todayOperational, type Notice, type StudentValues } from './student-onboarding';

type Service = { id: string; name: string; durationMinutes: number; isSelectable?: boolean };
type Plan = { id: string; name: string; isSelectable?: boolean; services: Service[] };
type Submission = { values?: StudentValues | undefined; confirmed?: boolean };
const fieldClass = 'mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm';
const messages: Record<string, string> = {
  SALA_WEEKLY_LIMIT_EXCEEDED: 'Alcanzaste el límite de sesiones de tu plan para esta semana. Cancelá una reserva futura si necesitás cambiar de horario.',
  SALA_OCCURRENCE_DUPLICATE: 'La Persona ya tiene una presencia registrada para este horario.',
  SALA_PARTICIPATION_REQUIRED: 'La Persona no tiene una participación válida de Sala para esa fecha.',
  SALA_SERVICE_NOT_INCLUDED_IN_PLAN: 'El Servicio no está incluido en el Plan de la Persona.',
  SALA_SERVICE_TYPE_INVALID: 'El Servicio ya no está disponible.',
  SALA_REQUIRED_SLOTS_UNAVAILABLE: 'El Servicio no entra completo en el horario seleccionado.',
  SALA_SCHEDULE_CLOSED: 'El horario está cerrado para esa fecha.',
  SALA_SPONTANEOUS_TIME_PASSED: 'Ese horario ya pasó. Elegí un horario actual o posterior.',
  SALA_SPONTANEOUS_FUTURE_NOT_ALLOWED: 'La incorporación espontánea sólo puede registrarse para hoy o una fecha pasada. Para una fecha futura usá una Reserva puntual o un Turno fijo.',
  SALA_SPONTANEOUS_ONBOARDING_TODAY_ONLY: 'El alta desde incorporación espontánea sólo está disponible para hoy.',
  PERSON_DNI_ALREADY_EXISTS: 'Ya existe una Persona con ese DNI. Seleccionala como Persona existente.',
  SALA_PROFESSOR_INVALID: 'Seleccioná un Profesor principal activo.',
  SALA_PLAN_INVALID: 'El Plan ya no está disponible.',
};
function checked<T>(response: { status: number; data: T }): T {
  if (response.status < 200 || response.status >= 300) {
    const code = (response.data as { code?: string })?.code ?? '';
    throw Object.assign(new Error(messages[code] ?? 'No pudimos incorporar a la Persona. Revisá los datos e intentá nuevamente.'), { code });
  }
  return response.data;
}
function minutes(value: string): number { const [hour = 0, minute = 0] = value.split(':').map(Number); return hour * 60 + minute; }

function currentOperationalMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const clock = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(clock.hour) * 60 + Number(clock.minute);
}

export function SpontaneousModal({ date, groups, initialSlotId, csrfToken, canManageParticipation, canCreatePerson, onSaved, onClose }: {
  date: string; groups: AgendaGroup[]; initialSlotId: string; csrfToken: string; canManageParticipation: boolean; canCreatePerson: boolean; onSaved: (notice?: Notice) => void; onClose: () => void;
}): React.JSX.Element {
  const today = todayOperational();
  const visibleGroups = groups.filter(item => !item.isClosed && (date !== today || minutes(item.slot.startTime) >= currentOperationalMinutes()));
  const future = date > today;
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [personId, setPersonId] = useState('');
  const term = search.trim();
  const people = useQuery({ queryKey: ['people', 'spontaneous-search', term], enabled: !future && mode === 'existing' && term.length > 0, queryFn: () => fetchPeople({ search: term, page: 1, pageSize: 10 }) });
  const [slotId, setSlotId] = useState(initialSlotId);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [confirmation, setConfirmation] = useState<Submission | null>(null);
  const client = useQueryClient();
  const options = { credentials: 'include', headers: { 'x-csrf-token': csrfToken } } satisfies RequestInit;
  const paper = usePaperDeclaration();
  const form = useForm<StudentValues>({ resolver: zodResolver(studentSchema), defaultValues: { ...personDefaults(), planId: '', mainProfessorId: '' } });
  const eligibility = useQuery({ queryKey: ['sala', 'spontaneous-options', personId, date], enabled: !future && mode === 'existing' && Boolean(personId), queryFn: async () => checked(await getPersonSalaSpontaneousOptions(personId, { date }, options)).data });
  const needsJoin = mode === 'existing' && eligibility.data?.eligible === false;
  const inline = !future && date === today && canManageParticipation && (mode === 'new' || needsJoin);
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: inline, queryFn: async () => checked(await listSalaPlans(options)).data as unknown as Plan[] });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: inline, queryFn: async () => checked(await listSalaProfessors(options)).data });
  const planId = form.watch('planId');
  const professorId = form.watch('mainProfessorId');
  const plan = plans.data?.find((item) => item.id === planId && item.isSelectable !== false);
  const services = mode === 'existing' && eligibility.data?.eligible ? eligibility.data.services : inline ? plan?.services.filter((service) => service.isSelectable !== false) ?? [] : [];
  const service = serviceTypeId ? services.find((item) => item.id === serviceTypeId) : { id: '', name: 'Sala', durationMinutes: 60 };
  const group = visibleGroups.find((item) => item.slot.id === slotId && !item.isClosed);
  const ready = !future && Boolean(service && group) && (mode === 'existing' && eligibility.data?.eligible ? true : inline && Boolean(plan && professorId)) && (mode === 'new' || Boolean(personId));
  const start = group ? minutes(group.slot.startTime) : 0;
  const full = Boolean(service && group && groups.some((item) => (item.slot.scheduleSlotId ?? item.slot.id) === (group.slot.scheduleSlotId ?? group.slot.id) && minutes(item.slot.startTime) >= start && minutes(item.slot.startTime) < start + service.durationMinutes && item.reserved >= item.capacity));
  const mutation = useMutation({ gcTime: 0, mutationFn: async ({ values, confirmed }: Submission) => {
    if (!group || !service || !csrfToken) throw new Error('Seleccioná Persona y horario.');
    const occurrence = { date, scheduleSlotId: group.slot.scheduleSlotId ?? group.slot.id, startTime: group.slot.startTime, ...(service.id ? { serviceTypeId: service.id } : {}), ...(confirmed ? { confirmOverbooking: true } : {}) };
    if (mode === 'new') {
      if (!values) throw new Error('Completá los datos de la Persona.');
      const { planId, mainProfessorId, ...generalPerson } = values;
      const result = checked(await createSalaStudentAndSpontaneousOccurrence({ ...personInput(generalPerson as PersonValues), planId, mainProfessorId, ...occurrence, ...paper.input() }, options)).data.person;
      return result.initialPin ? { pin: result.initialPin, firstName: result.firstName, lastName: result.lastName } : undefined;
    }
    if (needsJoin) checked(await joinSalaAndCreateSpontaneousOccurrence({ ...occurrence, personId, planId, mainProfessorId: professorId, ...paper.input() }, options));
    else checked(await createSpontaneousSalaOccurrence({ ...occurrence, personId }, options));
    return undefined;
  }, onSuccess: async (notice) => {
    await Promise.all([client.invalidateQueries({ queryKey: ['sala', 'agenda', date] }), client.invalidateQueries({ queryKey: ['sala', 'availability', date] }), client.invalidateQueries({ queryKey: ['people'] }), client.invalidateQueries({ queryKey: ['sala', 'spontaneous-options'] })]);
    onSaved(notice);
  }, onError: (error, submission) => { if ((error as { code?: string }).code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED') setConfirmation(submission); } });
  const submit = (values?: StudentValues) => { if (!ready) return; if (full) setConfirmation({ values }); else mutation.mutate({ values }); };
  const resetSelection = () => { setServiceTypeId(''); setConfirmation(null); mutation.reset(); };
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="presentation"><div className={`max-h-[90vh] w-full ${mode === 'new' ? 'max-w-4xl' : 'max-w-xl'} overflow-auto rounded-md bg-white p-6 shadow-sm`} role="dialog" aria-modal="true" aria-labelledby="spontaneous-title">
    <h2 id="spontaneous-title" className="text-xl font-semibold">Incorporación espontánea</h2>
    <p className="mt-1 text-sm text-muted-foreground">La fecha seleccionada es {date}.</p>
    {date === today ? <p className="mt-3 text-sm">La incorporación espontánea se realiza únicamente en el día de hoy. Te llevamos a los horarios disponibles de hoy.</p> : null}
    {future ? <><p className="mt-5 text-sm">La incorporación espontánea no se utiliza para fechas futuras. Para una fecha futura usá una Reserva puntual o un Turno fijo.</p><Button className="mt-5" variant="secondary" onClick={onClose}>Cerrar</Button></> : <>
      {date === today && canManageParticipation && canCreatePerson && <Button className="mt-4" variant="secondary" onClick={() => { setMode(mode === 'new' ? 'existing' : 'new'); resetSelection(); }}>{mode === 'new' ? 'Persona existente' : 'Nueva Persona'}</Button>}
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={mode === 'new' ? form.handleSubmit(submit) : (event) => { event.preventDefault(); submit(); }}>
        {mode === 'new' ? <GeneralPersonFields form={form as unknown as UseFormReturn<PersonValues>} /> : <div className="grid gap-3 sm:col-span-2">
          <label className="text-sm">Buscar Persona<input aria-label="Buscar Persona" placeholder="Nombre, apellido o DNI" className={fieldClass} value={search} disabled={mutation.isPending} onChange={(event) => { setSearch(event.target.value); setPersonId(''); resetSelection(); }} /></label>
          {term ? people.isFetching ? <p role="status">Buscando Personas…</p> : people.isError ? <p role="alert">No pudimos buscar Personas. Intentá nuevamente.</p> : people.isSuccess && !people.data.data.length ? <p role="status">No encontramos una Persona con esa búsqueda.</p> : people.isSuccess ? <div className="grid gap-2" role="group" aria-label="Resultados">
            <p className="text-sm font-medium">Resultados</p>
            {people.data.data.map(person => <button key={person.id} type="button" aria-label={`${person.firstName} ${person.lastName} · DNI ${person.dni}`} aria-pressed={personId === person.id} disabled={mutation.isPending} className={`w-full rounded-md border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${personId === person.id ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-muted'}`} onClick={() => { setPersonId(person.id); resetSelection(); }}>
              <span className="block font-medium">{person.firstName} {person.lastName}</span>
              <span className="block text-muted-foreground">DNI {person.dni}</span>
            </button>)}
          </div> : null : null}
          {eligibility.isLoading && <p role="status">Consultando participación de Sala…</p>}
          {eligibility.isError && <p role="alert">No pudimos consultar la participación de Sala.</p>}
          {needsJoin && date < today && <p>La Persona no tenía una participación de Sala vigente en esa fecha.</p>}
          {needsJoin && date === today && !canManageParticipation && <p>No tenés permiso para incorporar esta Persona a Sala.</p>}
          {eligibility.data?.eligible && <div className="grid grid-cols-2 gap-3 text-sm"><div>Plan<p className="font-medium">{eligibility.data.plan?.name}</p></div><div>Profesor principal<p className="font-medium">{eligibility.data.mainProfessor?.firstName} {eligibility.data.mainProfessor?.lastName}</p></div></div>}
        </div>}
        {inline && (mode === 'new' ? <section className="border-t border-border pt-4 sm:col-span-2"><h3 className="mb-3 text-sm font-semibold">Entrenamiento</h3><div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Plan<select aria-label="Plan" className={fieldClass} {...form.register('planId', { onChange: resetSelection })}><option value="">Seleccionar Plan</option>{plans.data?.filter((item) => item.isSelectable !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.planId?.message}</span></label>
          <label className="text-sm">Profesor principal<select aria-label="Profesor principal" className={fieldClass} {...form.register('mainProfessorId')}><option value="">Seleccionar Profesor</option>{professors.data?.map((professor) => <option key={professor.id} value={professor.id}>{professor.lastName}, {professor.firstName}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.mainProfessorId?.message}</span></label>
          {(plans.isError || professors.isError) && <p role="alert" className="sm:col-span-2">No pudimos cargar los Planes o Profesores.</p>}
        </div></section> : <>
          <label className="text-sm">Plan<select aria-label="Plan" className={fieldClass} {...form.register('planId', { onChange: resetSelection })}><option value="">Seleccionar Plan</option>{plans.data?.filter((item) => item.isSelectable !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.planId?.message}</span></label>
          <label className="text-sm">Profesor principal<select aria-label="Profesor principal" className={fieldClass} {...form.register('mainProfessorId')}><option value="">Seleccionar Profesor</option>{professors.data?.map((professor) => <option key={professor.id} value={professor.id}>{professor.lastName}, {professor.firstName}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.mainProfessorId?.message}</span></label>
          {(plans.isError || professors.isError) && <p role="alert" className="sm:col-span-2">No pudimos cargar los Planes o Profesores.</p>}
        </>)}
        {(inline || (mode === 'existing' && eligibility.data?.eligible)) && <>
          {mode === 'new' ? <section className="border-t border-border pt-4 sm:col-span-2"><h3 className="mb-3 text-sm font-semibold">Incorporación</h3><div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Servicio (opcional)<select aria-label="Servicio" className={fieldClass} value={serviceTypeId} onChange={(event) => { setServiceTypeId(event.target.value); setConfirmation(null); mutation.reset(); }}><option value="">Sin servicio — Sala (60 min)</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}</select></label>
            <label className="text-sm">Horario<select aria-label="Horario espontáneo" className={fieldClass} value={slotId} onChange={(event) => { setSlotId(event.target.value); setConfirmation(null); }}><option value="">Seleccionar horario</option>{visibleGroups.map((item) => <option key={item.slot.id} value={item.slot.id}>{item.slot.startTime}{item.available === 0 ? ' · Sin lugar' : ''}</option>)}</select></label>
            {plan && !services.length && <p className="text-sm sm:col-span-2">Podés registrar Sala sin seleccionar un Servicio.</p>}
            {eligibility.data?.eligible && !services.length && <p className="text-sm sm:col-span-2">Podés registrar Sala sin seleccionar un Servicio.</p>}
          </div></section> : <>
            <label className="text-sm">Servicio (opcional)<select aria-label="Servicio" className={fieldClass} value={serviceTypeId} onChange={(event) => { setServiceTypeId(event.target.value); setConfirmation(null); mutation.reset(); }}><option value="">Sin servicio — Sala (60 min)</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}</select></label>
            <label className="text-sm">Horario<select aria-label="Horario espontáneo" className={fieldClass} value={slotId} onChange={(event) => { setSlotId(event.target.value); setConfirmation(null); }}><option value="">Seleccionar horario</option>{visibleGroups.map((item) => <option key={item.slot.id} value={item.slot.id}>{item.slot.startTime}{item.available === 0 ? ' · Sin lugar' : ''}</option>)}</select></label>
            {plan && !services.length && <p className="text-sm sm:col-span-2">Podés registrar Sala sin seleccionar un Servicio.</p>}
            {eligibility.data?.eligible && !services.length && <p className="text-sm sm:col-span-2">Podés registrar Sala sin seleccionar un Servicio.</p>}
          </>}
        </>}
        {inline ? <PaperDeclarationFields value={paper} disabled={mutation.isPending} /> : null}
        {date === today && visibleGroups.length === 0 && <p className="text-sm sm:col-span-2">No quedan horarios disponibles para hoy.</p>}
        {mutation.isError && (mutation.error as { code?: string }).code !== 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{mutation.error.message}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!ready || mutation.isPending}>{mutation.isPending ? 'Incorporando…' : 'Incorporar'}</Button></div>
      </form>
      {confirmation && <div role="alertdialog" aria-modal="true" aria-label="Confirmar sobrecupo" className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4"><p className="text-sm">{serviceTypeId ? 'Este Servicio' : 'Sala'} supera la capacidad disponible en el horario seleccionado. ¿Querés incorporar igualmente?</p><div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Cancelar</Button><Button type="button" disabled={mutation.isPending} onClick={() => { mutation.mutate({ ...confirmation, confirmed: true }); setConfirmation(null); }}>Incorporar igualmente</Button></div></div>}
    </>}
  </div></div>;
}
