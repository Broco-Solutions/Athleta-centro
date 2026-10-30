'use client';
import { personTrainingApi } from './training-record-api';
import React, { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, CalendarDays, Dumbbell, WalletCards, type LucideIcon } from 'lucide-react';
import { formatOperationalDate } from '../../lib/operational-date';
import { Button } from '@athleta/ui';
import { GeneralPersonForm, personInput, type PersonValues } from '../people/general-person-form';
import { usePinDialogFocus } from '../people/use-pin-dialog-focus';
import { editPerson, resetPersonPortalPin } from '../people/people-api';
import { reassignFixedSalaOccurrence, listPersonPhysicalEvaluations, listSalaStudents, cancelSalaReservation, changeFixedSalaBooking, createFixedSalaBooking, duplicateSalaRoutine, createSalaReservation, endFixedSalaBooking, getPerson, getSalaAvailability, listFixedSalaBookings, listPersonSalaParticipations, listPersonSalaRoutines, listSalaExerciseDefinitions, listSalaMovementPatterns, listSalaRoutineTemplates, listSalaReservations, listPersonSalaServices, replaceSalaRoutine, type ChangeFixedBookingDto, type FixedBookingDto, type OneOffReservationDto } from '@athleta/api-client';
import { currentSession } from '../auth/auth';
import { WorkspaceShell } from '../auth/workspace-shell';
import { RoutinePanel, type RoutineApi } from './routine-panel';
import { PhysicalEvaluationPanel } from './physical-evaluation-panel';
import { SalaPaymentPanel } from '../finance/sala-payment-panel';
import { HealthDeclarationPanel } from '../health-declaration/health-panel';
import { ParticipationManagement } from './participation-management';

type Participation = { id: string; objective?: string | null; mainProfessorId?: string; planId?: string; endDate?: string | null; mainProfessor?: { id?: string; firstName: string; lastName: string } | null; plan?: { id: string; name: string; monthlyAmount: string; weeklySessions?: number | null } };
type Slot = { id: string; scheduleSlotId?: string; startTime: string; weekday?: string };
type Fixed = { id: string; salaParticipationId?: string; startTime?: string | null; startDate: string; endDate?: string | null; scheduleSlot?: Slot; serviceType?: Service | null };
type Reservation = { id: string; date: string; startTime?: string | null; cancelledAt?: string | null; scheduleSlot?: Slot };
type Service = { id: string; name: string; durationMinutes: number };
function salaData<T>(response: { status: number; data: { data: T } }): T {
  assertRoutineResponse(response);
  return response.data.data;
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const options = (csrf: string): RequestInit => ({ credentials: 'include', headers: { 'x-csrf-token': csrf } });
const dateLabel = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
function assertBookingResponse(response: unknown): void {
  const result = response as { status?: number; data?: { code?: string; message?: string } };
  if (!result.status || result.status < 400) return;
  if (result.data?.code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED') throw new Error('No hay lugar disponible para ese horario.');
  if (result.data?.code === 'SALA_RESERVATION_DUPLICATE' || result.data?.code === 'SALA_BOOKING_OVERLAP') throw new Error('La Persona ya tiene una actividad reservada en ese horario. Elegí otro horario.');
  if (result.data?.code === 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED') throw new Error('El alumno ya tiene asignada la cantidad máxima de turnos fijos permitida por su Plan.');
  if (result.data?.code === 'SALA_SCHEDULE_CLOSED') throw new Error('El horario está cerrado para esa fecha.');
  if (result.data?.code === 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN' || result.data?.code === 'SALA_SERVICE_TYPE_INVALID') throw new Error('El Servicio no está disponible para el Plan actual.');
  throw new Error(result.data?.message ?? 'No se pudo guardar la reserva.');
}

function assertRoutineResponse(response: { status: number; data: unknown }): void {
  if (response.status < 400) return;
  const body = response.data as { code?: string; message?: string; details?: unknown } | null;
  throw Object.assign(new Error(body?.message ?? 'No se pudo completar la operación.'), {
    code: body?.code, details: body?.details,
  });
}

const reassignSchema = z.object({ sourceDate: z.iso.date(), targetDate: z.iso.date(), scheduleSlotId: z.string().min(1), startTime: z.string().regex(/^([01]\d|2[0-3]):00$/) });
const emptyReassignment = { sourceDate: '', targetDate: '', scheduleSlotId: '', startTime: '' };

export function SalaPersonWorkspace({ personId }: { personId: string }): React.JSX.Element {
  const search = useSearchParams(); const requestedTab = search.get('tab') ?? 'summary'; const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const csrf = session.data?.csrfToken ?? ''; const client = useQueryClient();
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const tab = isProfessorOnly && ['reservations', 'fixed'].includes(requestedTab) ? 'turns' : requestedTab === 'payments' && !isProfessorOnly ? 'summary' : requestedTab;
  const person = useQuery({ queryKey: ['person', personId], queryFn: async () => (await getPerson(personId, { credentials: 'include' })).data.data });
  const participations = useQuery({ queryKey: ['sala-participations', personId], queryFn: async () => salaData(await listPersonSalaParticipations(personId, options(csrf))), enabled: Boolean(csrf) }); const active = participations.data?.find((item) => !item.endDate);
  const fixed = useQuery({ queryKey: ['sala-fixed', personId], queryFn: async () => salaData(await listFixedSalaBookings(personId, options(csrf))), enabled: Boolean(csrf) }); const reservations = useQuery({ queryKey: ['sala-reservations', personId], queryFn: async () => salaData(await listSalaReservations(personId, options(csrf))), enabled: Boolean(csrf) });
  const [date, setDate] = useState(today); const [serviceId, setServiceId] = useState(''); const [slotId, setSlotId] = useState(''); const [startTime, setStartTime] = useState(''); const [editingFixed, setEditingFixed] = useState<Fixed | null>(null);
  const [fixedDay, setFixedDay] = useState('MONDAY');
  const [fixedSlotId, setFixedSlotId] = useState('');
  const [fixedStartTime, setFixedStartTime] = useState('');
  const [editingPerson, setEditingPerson] = useState(false);
  const [resetPinConfirmation, setResetPinConfirmation] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);
  const [personFeedback, setPersonFeedback] = useState('');
  const [reassigningFixed, setReassigningFixed] = useState<Fixed | null>(null);
  const reassignForm = useForm({ resolver: zodResolver(reassignSchema), defaultValues: emptyReassignment });
  const reassignSourceDate = useWatch({ control: reassignForm.control, name: 'sourceDate' });
  const reassignTargetDate = useWatch({ control: reassignForm.control, name: 'targetDate' });
  const reassignSlotId = useWatch({ control: reassignForm.control, name: 'scheduleSlotId' });
  const reassignStartTime = useWatch({ control: reassignForm.control, name: 'startTime' });
  const setReassignSourceDate = (value: string) => reassignForm.setValue('sourceDate', value);
  const setReassignTargetDate = (value: string) => reassignForm.setValue('targetDate', value);
  const setReassignSlotId = (value: string) => reassignForm.setValue('scheduleSlotId', value);
  const setReassignStartTime = (value: string) => reassignForm.setValue('startTime', value);
  const [reassignFeedback, setReassignFeedback] = useState('');
  const resetReassignment = () => { setReassigningFixed(null); reassignForm.reset(emptyReassignment); };
  const reassignAvailability = useQuery({ queryKey: ['sala', 'availability', reassignTargetDate], queryFn: async () => salaData(await getSalaAvailability({ date: reassignTargetDate }, { credentials: 'include' })), enabled: Boolean(reassignTargetDate) });
  const reassignWeek = occurrenceWeek(reassignSourceDate);
  const reassignTimes = (reassignAvailability.data ?? []).filter(slot => {
    if (!/^([01]\d|2[0-3]):00$/.test(slot.startTime) || !operationalFuture(reassignTargetDate, slot.startTime)) return false;
    return [0, 15, 30, 45].every(minute => (reassignAvailability.data ?? []).some(part => part.scheduleSlotId === slot.scheduleSlotId && part.startTime === `${slot.startTime.slice(0, 2)}:${String(minute).padStart(2, '0')}` && !part.isClosed && part.available > 0));
  });
  const reassignTargetValid = Boolean(reassignSourceDate && reassignTargetDate >= reassignWeek.start && reassignTargetDate <= reassignWeek.end && reassignTargetDate >= today() && reassignTargetDate !== reassignSourceDate);
  const reassign = useMutation({ mutationFn: async () => {
    if (!reassigningFixed || !reassignTargetValid || !reassignTimes.some(slot => slot.scheduleSlotId === reassignSlotId && slot.startTime === reassignStartTime)) throw new Error('Seleccioná una fecha y horario válidos de la misma semana.');
    assertBookingResponse(await reassignFixedSalaOccurrence(reassigningFixed.id, reassignSourceDate, { targetDate: reassignTargetDate, scheduleSlotId: reassignSlotId, startTime: reassignStartTime }, options(csrf)));
  }, onSuccess: async () => { resetReassignment(); setReassignFeedback('Fecha reprogramada correctamente.'); await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['sala', 'availability'] })]); } });
  const fixedDate = nextFixedDate(fixedDay);
  const fixedAvailability = useQuery({ queryKey: ['sala', 'availability', fixedDate], queryFn: async () => salaData(await getSalaAvailability({ date: fixedDate }, { credentials: 'include' })) });
  const activeFixedBookings = active ? (fixed.data ?? []).filter(item => item.salaParticipationId === active.id && (!item.endDate || item.endDate.slice(0, 10) > today())) : [];
  const fixedLimit = active?.plan?.weeklySessions;
  const fixedAtLimit = fixedLimit != null && activeFixedBookings.length >= fixedLimit;
  const fixedBase = { personId, salaParticipationId: active?.id ?? '', scheduleSlotId: fixedSlotId, startTime: fixedStartTime, startDate: fixedDate };
  const services = useQuery({ queryKey: ['sala', 'person-services', personId], queryFn: async () => { const response = await listPersonSalaServices(personId, { credentials: 'include' }); assertRoutineResponse(response); return response.data.data ?? []; }, enabled: Boolean(active) }); const availability = useQuery({ queryKey: ['sala', 'availability', date], queryFn: async () => salaData(await getSalaAvailability({ date }, { credentials: 'include' })) });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['sala-fixed', personId] }), client.invalidateQueries({ queryKey: ['sala-reservations', personId] })]); };
  const bookingBase = { personId, salaParticipationId: active?.id ?? '', scheduleSlotId: slotId, ...(serviceId ? { serviceTypeId: serviceId } : {}), startTime };
  const reserve = useMutation({ mutationFn: async () => { const payload: OneOffReservationDto = { ...bookingBase, date }; return assertBookingResponse(await createSalaReservation(payload, options(csrf))); }, onSuccess: refresh }); const createFixed = useMutation({ mutationFn: async () => { const payload: FixedBookingDto = fixedBase; return assertBookingResponse(await createFixedSalaBooking(payload, options(csrf))); }, onSuccess: refresh }); const updateFixed = useMutation({ mutationFn: async () => { if (editingFixed) { const payload: ChangeFixedBookingDto = { ...fixedBase, id: editingFixed.id }; assertBookingResponse(await changeFixedSalaBooking(editingFixed.id, payload, options(csrf))); } }, onSuccess: async () => { setEditingFixed(null); await refresh(); } }); const finishFixed = useMutation({ mutationFn: async (id: string) => assertBookingResponse(await endFixedSalaBooking(id, { endDate: today() }, options(csrf))), onSuccess: async (_, id) => { if (editingFixed?.id === id) setEditingFixed(null); if (reassigningFixed?.id === id) resetReassignment(); await refresh(); } }); const cancel = useMutation({ mutationFn: (id: string) => cancelSalaReservation(id, options(csrf)), onSuccess: refresh });
  const routineApi: RoutineApi = {
    training: personTrainingApi(personId),
    list: async (id, requestOptions) => { const response = await listPersonSalaRoutines(id, requestOptions); assertRoutineResponse(response); return response.data.data; },
    templates: async (requestOptions) => { const response = await listSalaRoutineTemplates(requestOptions); assertRoutineResponse(response); return response.data.data; },
    exercises: async (requestOptions) => { const response = await listSalaExerciseDefinitions(requestOptions); assertRoutineResponse(response); return response.data.data; },
    patterns: async (requestOptions) => { const response = await listSalaMovementPatterns(requestOptions); assertRoutineResponse(response); return response.data.data; },
    create: async (input, requestOptions) => assertRoutineResponse(await replaceSalaRoutine(input, requestOptions)),
    replace: async (_id, input, requestOptions) => assertRoutineResponse(await replaceSalaRoutine(input, requestOptions)),
    duplicate: async (id, requestOptions) => assertRoutineResponse(await duplicateSalaRoutine(id, requestOptions)),

  };
  const permissions = session.data?.permissions ?? [];
  const canEditPerson = permissions.includes('PEOPLE_UPDATE_GENERAL');
  const canResetPortalPin = permissions.includes('PORTAL_PIN_RESET');
  const savePerson = useMutation({ mutationFn: async (values: PersonValues) => { if (!csrf) throw new Error('Sesión inválida'); return editPerson(personId, personInput(values), csrf); }, onSuccess: async (updated) => { client.setQueryData(['person', personId], updated); await client.invalidateQueries({ queryKey: ['people'] }); setEditingPerson(false); setPersonFeedback('Datos guardados correctamente'); } });
  const resettingPin = React.useRef(false);
  const resetPin = useMutation({ gcTime: 0, retry: false, onSettled: () => { resettingPin.current = false; }, mutationFn: async () => { if (!csrf) throw new Error('Sesión inválida'); return resetPersonPortalPin(personId, csrf); }, onSuccess: (pin) => { setResetPinConfirmation(false); setGeneratedPin(pin); setPinCopied(false); } });
  const [pinCopyError, setPinCopyError] = React.useState(false);
  const pinDialogRef = usePinDialogFocus(generatedPin !== null ? 'result' : resetPinConfirmation ? 'confirmation' : null, () => { if (resettingPin.current) return; setResetPinConfirmation(false); setGeneratedPin(null); setPinCopied(false); setPinCopyError(false); resetPin.reset(); });
  const copyPin = async () => { if (!generatedPin) return; try { await navigator.clipboard.writeText(generatedPin); setPinCopied(true); setPinCopyError(false); } catch { setPinCopied(false); setPinCopyError(true); } };
  const closePinNotice = () => { setGeneratedPin(null); setPinCopied(false); setPinCopyError(false); resetPin.reset(); };
  const canManageAgenda = permissions.includes('SALA_AGENDA_MANAGE');
  const canReadEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_READ');
  const canManageEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_MANAGE');
  const canManagePhysicalTests = permissions.includes('SALA_PHYSICAL_TEST_CATALOG_MANAGE');
  const canReadRoutines = session.data?.permissions.includes('SALA_ROUTINE_READ') ?? false;
  const canManageRoutines = session.data?.permissions.includes('SALA_ROUTINE_MANAGE') ?? false;
  if (person.isLoading) return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><p>Cargando Persona…</p></WorkspaceShell>; if (person.isError || !person.data) return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><p role="alert">No pudimos cargar la Persona.</p></WorkspaceShell>;
  const p = person.data; const canReadPayments = session.data?.permissions.includes('SALA_PAYMENT_READ') ?? false; const links = isProfessorOnly
    ? [['summary', 'Resumen'], ...(canReadRoutines ? [['routine', 'Rutina']] : []), ...(canReadEvaluations ? [['evaluations', 'Evaluaciones']] : []), ['turns', 'Turnos'], ...(canReadPayments ? [['payments', 'Pagos']] : [])]
    : [['summary', 'Resumen'], ['fixed', 'Turno fijo'], ['reservations', 'Reservas'], ...(canReadRoutines ? [['routine', 'Rutina']] : []), ...(canReadEvaluations ? [['evaluations', 'Evaluaciones físicas']] : [])];
  return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><div className="mx-auto min-w-0 max-w-7xl space-y-5"><nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href={isProfessorOnly ? '/students' : '/sala'}>{isProfessorOnly ? 'Alumnos' : 'Sala'}</Link> <span aria-hidden="true">/</span> <strong className="text-foreground">{p.firstName} {p.lastName}</strong></nav>{isProfessorOnly ? <header className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row">
        <div className="min-w-0 flex-1"><h1 className="break-words text-2xl font-semibold uppercase tracking-wide sm:text-3xl">{p.firstName} {p.lastName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">DNI {p.dni}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{active?.plan?.name ?? 'Sin plan'} · Profesor principal: {active?.mainProfessor ? `${active.mainProfessor.firstName} ${active.mainProfessor.lastName}` : 'Sin asignar'}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end"><span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-muted text-muted-foreground'}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-current"/>{active ? 'Participación activa' : 'Sin participación activa'}</span>{canEditPerson ? <Button type="button" variant="secondary" onClick={() => { savePerson.reset(); setPersonFeedback(''); setEditingPerson(true); }}>Editar datos</Button> : null}{canResetPortalPin ? <Button type="button" variant="secondary" onClick={() => { resetPin.reset(); setResetPinConfirmation(true); }}>Restablecer PIN del Portal</Button> : null}</div>
      </div>
    </header> : <header className="rounded-md border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-muted-foreground">{isProfessorOnly ? 'Alumno' : 'Workspace Sala'}</p><h1 className="break-words text-3xl font-semibold">{p.firstName} {p.lastName}</h1><p className="mt-1 text-sm">DNI {p.dni} · <span className={active ? 'font-medium text-emerald-700' : 'text-muted-foreground'}>{active ? 'Participación activa' : 'Sin participación activa'}</span></p></div><div className="flex flex-wrap gap-2">{canEditPerson ? <Button type="button" variant="secondary" onClick={() => { savePerson.reset(); setPersonFeedback(''); setEditingPerson(true); }}>Editar datos</Button> : null}{canResetPortalPin ? <Button type="button" variant="secondary" onClick={() => { resetPin.reset(); setResetPinConfirmation(true); }}>Restablecer PIN del Portal</Button> : null}{!isProfessorOnly ? <Link href={`/people/${personId}`} className="rounded-md border px-3 py-2 text-sm">Ver ficha de Persona</Link> : null}</div></div></header>}{personFeedback ? <p role="status" className="rounded-md border bg-white p-3 text-sm text-green-800">{personFeedback}</p> : null}{editingPerson ? <div role="dialog" aria-modal="true" aria-labelledby="edit-person-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-md bg-white p-6 shadow-lg"><h2 id="edit-person-title" className="text-xl font-semibold">Editar datos</h2><GeneralPersonForm key={personId} person={p} pending={savePerson.isPending} onSave={(values) => savePerson.mutate(values)} onCancel={() => { setEditingPerson(false); savePerson.reset(); }} {...(savePerson.isError ? { error: (savePerson.error as { status?: number }).status === 409 ? 'Ya existe una Persona con ese DNI.' : 'No pudimos guardar los datos.' } : {})}/></div></div> : null}{resetPinConfirmation ? <div ref={pinDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="reset-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-md bg-white p-6 shadow-lg"><h2 id="reset-pin-title" className="text-lg font-semibold">Restablecer PIN del Portal</h2><p className="mt-2 text-sm text-muted-foreground">Se generará un nuevo PIN temporal para este alumno. El PIN actual dejará de funcionar.</p>{resetPin.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{resetPin.error instanceof Error ? resetPin.error.message : 'No pudimos generar un nuevo PIN. Intentá nuevamente.'}</p> : null}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={resetPin.isPending} onClick={() => { setResetPinConfirmation(false); resetPin.reset(); }}>Cancelar</Button><Button type="button" onClick={() => { if (resettingPin.current) return; resettingPin.current = true; resetPin.mutate(); }} disabled={resetPin.isPending}>{resetPin.isPending ? 'Generando…' : 'Confirmar restablecimiento'}</Button></div></div></div> : null}{generatedPin !== null ? <div ref={pinDialogRef} role="dialog" aria-modal="true" aria-labelledby="new-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-md bg-white p-6 text-center shadow-lg"><h2 id="new-pin-title" className="text-lg font-semibold">Nuevo PIN temporal</h2><p className="mt-2 text-sm">{p.firstName} {p.lastName}</p><p aria-label="PIN temporal" className="mt-5 select-text font-mono text-4xl font-bold tracking-[0.35em]">{generatedPin}</p><p className="mt-3 text-sm text-muted-foreground">Este PIN se mostrará una sola vez. Compartilo de forma segura con el alumno.</p><div className="mt-5 flex justify-center gap-2"><Button type="button" variant="secondary" onClick={copyPin}>Copiar PIN</Button><Button type="button" onClick={closePinNotice}>Entendido</Button></div>{pinCopyError ? <p role="alert" className="mt-3 text-sm text-red-700">No pudimos copiarlo. Seleccioná el PIN y copialo manualmente.</p> : null}{pinCopied ? <p role="status" className="mt-3 text-sm text-green-700">PIN copiado</p> : null}</div></div> : null}<nav aria-label="Secciones del alumno en Sala" className="flex gap-1 overflow-x-auto border-b">{[...links, ['health', 'Declaración de salud']].map(([key, label]) => <Link key={key} aria-current={tab === key ? 'page' : undefined} href={`/sala/people/${personId}?tab=${key}`} className={`whitespace-nowrap border-b-2 min-h-11 px-3 py-3 text-sm font-medium ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>{label}</Link>)}</nav>{tab === 'health' ? <HealthDeclarationPanel key={personId} personId={personId} canReadAnswers={canManageEvaluations} canRegisterPaper={session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false} csrfToken={csrf}/> : null}{tab === 'summary' && active ? <ParticipationManagement personId={personId} active={active} roles={session.data?.roles ?? []} permissions={session.data?.permissions ?? []} csrfToken={csrf}/> : null}{tab === 'summary' && isProfessorOnly ? <ProfessorDashboard personId={personId} active={active} fixed={{ ...fixed, data: activeFixedBookings }} reservations={reservations} permissions={session.data?.permissions ?? []} csrfToken={csrf}/> : null}{tab === 'summary' && !isProfessorOnly ? <><Summary personId={personId} active={active} fixed={activeFixedBookings[0]} reservations={reservations.data ?? []} canReadRoutines={canReadRoutines} canReadEvaluations={canReadEvaluations}/>{canReadPayments ? <SalaPaymentStatus personId={personId} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canUseFinance={permissions.includes('SALA_PAYMENT_MANAGE') && permissions.includes('FINANCE_OPERATIONAL_READ')}/> : null}</> : null}{(tab === 'fixed' || (isProfessorOnly && tab === 'turns')) ? <section className="rounded-md border bg-white p-5" aria-label={editingFixed ? 'Modificar turno fijo' : 'Crear turno fijo'}>
      {isProfessorOnly ? <h2 className="mb-4 text-xl font-semibold">Turno fijo</h2> : null}
      <FixedBookingForm title={editingFixed ? 'Modificar turno fijo' : 'Crear turno fijo'} day={fixedDay} onDayChange={value => { setFixedDay(value); setFixedSlotId(''); setFixedStartTime(''); }} availability={fixedAvailability.data ?? []} slotId={fixedSlotId} startTime={fixedStartTime} onTimeChange={(slot, time) => { setFixedSlotId(slot); setFixedStartTime(time); }} disabled={!canManageAgenda || !active || !fixed.isSuccess || createFixed.isPending || updateFixed.isPending || (!editingFixed && fixedAtLimit)} onSubmit={() => editingFixed ? updateFixed.mutate() : createFixed.mutate()} submitLabel={editingFixed ? 'Guardar cambios' : 'Crear turno fijo'}>
        <p className="mt-2 text-sm">Plan: {active?.plan?.name ?? 'Sin plan'}{fixedLimit != null ? ` · ${fixedLimit} veces por semana` : ''}</p>
        <p className="mt-1 text-sm">Turnos fijos: {activeFixedBookings.length}{fixedLimit != null ? ` de ${fixedLimit}` : ''}</p>
        {fixedAtLimit && !editingFixed ? <p className="mt-2 text-sm text-muted-foreground">Ya tiene asignada la cantidad máxima de turnos fijos permitida por su Plan.</p> : null}
      </FixedBookingForm>
      {(createFixed.error ?? updateFixed.error) instanceof Error ? <p role="alert" className="mt-2 text-sm text-red-700">{(createFixed.error ?? updateFixed.error as Error).message}</p> : null}
      {finishFixed.error instanceof Error ? <p role="alert" className="mt-2 text-sm text-red-700">{finishFixed.error.message}</p> : null}
      <div className="mt-5 space-y-2">{activeFixedBookings.length === 0 ? <p className="text-sm text-muted-foreground">No existe un turno fijo.</p> : activeFixedBookings.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>{weekdays[item.scheduleSlot?.weekday ?? ''] ?? 'Día'} · {bookingTime(item)} · Desde {dateLabel(item.startDate)}</span>{canManageAgenda ? <span className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setEditingFixed(item); setFixedDay(item.scheduleSlot?.weekday ?? 'MONDAY'); setFixedStartTime(bookingTime(item)); setFixedSlotId(item.scheduleSlot?.id ?? ''); }}>Modificar</Button><Button variant="secondary" onClick={() => { resetReassignment(); reassign.reset(); setReassignFeedback(''); setReassigningFixed(item); setReassignSourceDate(fixedOccurrences(item)[0] ?? ''); }}>Reprogramar fecha</Button><Button variant="secondary" disabled={finishFixed.isPending} onClick={() => finishFixed.mutate(item.id)}>Finalizar</Button></span> : null}</article>)}</div>
      {reassigningFixed ? <form aria-label="Reprogramar una fecha" className="mt-5 space-y-3 rounded-md border p-4" onSubmit={reassignForm.handleSubmit(() => reassign.mutate())}>
        <h3 className="font-semibold">Reprogramar una fecha</h3><p className="text-sm text-muted-foreground">Cambia sólo esta fecha. El turno fijo semanal continúa sin cambios.</p><p className="text-sm">Turno fijo: {weekdays[reassigningFixed.scheduleSlot?.weekday ?? '']} · {bookingTime(reassigningFixed)}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Fecha a cambiar<select className="mt-1 min-h-11 w-full rounded border px-3" value={reassignSourceDate} onChange={event => { setReassignSourceDate(event.target.value); setReassignTargetDate(''); setReassignSlotId(''); setReassignStartTime(''); }}><option value="">Seleccionar</option>{fixedOccurrences(reassigningFixed).map(day => <option key={day} value={day}>{dateLabel(day)}</option>)}</select></label>
          <label className="text-sm">Nuevo día<input type="date" className="mt-1 min-h-11 w-full rounded border px-3" min={reassignWeek.start > today() ? reassignWeek.start : today()} max={reassignWeek.end} value={reassignTargetDate} onChange={event => { setReassignTargetDate(event.target.value); setReassignSlotId(''); setReassignStartTime(''); }}/></label>
          <label className="text-sm">Nuevo horario<select className="mt-1 min-h-11 w-full rounded border px-3" value={reassignSlotId && reassignStartTime ? `${reassignSlotId}:${reassignStartTime}` : ''} onChange={event => { const selected = reassignTimes.find(slot => `${slot.scheduleSlotId}:${slot.startTime}` === event.target.value); setReassignSlotId(selected?.scheduleSlotId ?? ''); setReassignStartTime(selected?.startTime ?? ''); }}><option value="">Seleccionar</option>{reassignTimes.map(slot => <option key={slot.slotId} value={`${slot.scheduleSlotId}:${slot.startTime}`}>{slot.startTime}</option>)}</select></label>
        </div>
        {!reassignSourceDate ? <p className="text-sm">No hay fechas futuras disponibles en los próximos 30 días.</p> : null}
        {reassignTargetDate && !reassignTargetValid ? <p role="alert" className="text-sm text-red-700">Elegí otro día de la misma semana, desde hoy.</p> : null}
        {reassignAvailability.isError ? <p role="alert">No pudimos cargar los horarios disponibles.</p> : null}
        {reassign.error instanceof Error ? <p role="alert" className="text-sm text-red-700">{reassign.error.message}</p> : null}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={reassign.isPending || !reassignTargetValid || !reassignSlotId || !reassignTimes.some(slot => slot.scheduleSlotId === reassignSlotId && slot.startTime === reassignStartTime)}>Confirmar reprogramación</Button><Button type="button" variant="secondary" disabled={reassign.isPending} onClick={resetReassignment}>Cancelar</Button></div>
      </form> : null}
      {reassignFeedback ? <p role="status" className="mt-3 text-sm">{reassignFeedback}</p> : null}
    </section> : null}{(tab === 'reservations' || (isProfessorOnly && tab === 'turns')) ? <section className="rounded-md border bg-white p-5"><BookingForm professorLayout={isProfessorOnly} title="Nueva reserva puntual" date={date} setDate={setDate} services={services.data ?? []} servicesLoaded={Boolean(active)&&services.isSuccess} availability={availability.data ?? []} serviceId={serviceId} setServiceId={setServiceId} slotId={slotId} setSlotId={setSlotId} startTime={startTime} setStartTime={setStartTime} disabled={!active || reserve.isPending || Boolean(serviceId && !services.data?.some(service=>service.id===serviceId))} onSubmit={() => reserve.mutate()} submitLabel="Crear reserva"/>{reserve.error instanceof Error ? <p role="alert" className="mt-2 text-sm text-red-700">{reserve.error.message}</p> : null}<ReservationList rows={reservations.data ?? []} onCancel={(id) => cancel.mutate(id)}/></section> : null}{isProfessorOnly && tab === 'payments' && canReadPayments && participations.isSuccess ? <SalaPaymentPanel key={search.get('action') ?? 'payments'} personId={personId} csrfToken={csrf} activePlan={active?.plan} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canSelectPlan={permissions.includes('SALA_PAYMENT_REGISTER')} canAdjust={false} canReverse={false} defaultOpen={search.get('action') === 'renew'}/> : null}{tab === 'routine' && canReadRoutines ? <RoutinePanel personName={`${p.firstName} ${p.lastName}`} personId={personId} participationId={active?.id ?? ''} csrfToken={csrf} api={routineApi} canManage={canManageRoutines}/> : null}{tab === 'evaluations' && canReadEvaluations ? <PhysicalEvaluationPanel personId={personId} participationId={active?.id ?? null} professorId={session.data?.user?.id ?? ''} csrfToken={csrf} canManage={canManageEvaluations} canManageTestCatalog={canManagePhysicalTests}/> : null}</div></WorkspaceShell>;
}
type DashboardQuery<T> = { data: T[] | undefined; isPending: boolean; isError: boolean };
const bookingTime = (item: { startTime?: string | null; scheduleSlot?: Slot }): string => { const time = item.startTime ?? item.scheduleSlot?.startTime; return time ? (time.includes('T') ? time.slice(11, 16) : time) : '—'; };
const weekdays: Record<string, string> = { MONDAY: 'Lunes', TUESDAY: 'Martes', WEDNESDAY: 'Miércoles', THURSDAY: 'Jueves', FRIDAY: 'Viernes', SATURDAY: 'Sábado', SUNDAY: 'Domingo' };

function DashboardCard({ title, icon: Icon, href, action, children }: { title: string; icon: LucideIcon; href: string; action: string; children: React.ReactNode }): React.JSX.Element {
  return <article className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon aria-hidden="true" className="h-4 w-4 shrink-0"/>{title}</h3>
    <div className="mb-5 mt-3 flex-1 space-y-2 text-sm">{children}</div>
    <Link href={href} className="inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{action}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0"/></Link>
  </article>;
}
function DashboardFeedback({ query, children }: { query: { isPending: boolean; isError: boolean }; children: React.ReactNode }): React.JSX.Element {
  return query.isPending ? <p className="text-muted-foreground">Cargando…</p> : query.isError ? <p role="alert" className="text-muted-foreground">No pudimos cargar esta información.</p> : <>{children}</>;
}
function ProfessorDashboard({ personId, active, fixed, reservations, permissions, csrfToken }: {
  personId: string; active: Participation | undefined; fixed: DashboardQuery<Fixed>; reservations: DashboardQuery<Reservation>; permissions: string[]; csrfToken: string;
}): React.JSX.Element {
  const canReadRoutines = permissions.includes('SALA_ROUTINE_READ');
  const canManageRoutines = permissions.includes('SALA_ROUTINE_MANAGE');
  const canReadEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_READ');
  const canManageEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_MANAGE');
  const canReadPayments = permissions.includes('SALA_PAYMENT_READ');
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: async () => {
    const response = await listPersonSalaRoutines(personId, options(csrfToken)); assertRoutineResponse(response); return response.data.data;
  }, enabled: canReadRoutines });
  const evaluations = useQuery({ queryKey: ['sala', 'physical-evaluations', personId], queryFn: async () => {
    const response = await listPersonPhysicalEvaluations(personId, { credentials: 'include' }); assertRoutineResponse(response); return response.data.data;
  }, enabled: canReadEvaluations });
  const operationalToday = today();
  const routine = routines.data?.find(item => item.status === 'ACTIVE');
  const latestEvaluation = [...(evaluations.data ?? [])].sort((a, b) => b.evaluationDate.localeCompare(a.evaluationDate))[0];
  const currentFixed = fixed.data?.[0];
  const nextReservation = [...(reservations.data ?? [])].filter(item => !item.cancelledAt && item.date.slice(0, 10) >= operationalToday).sort((a, b) => a.date.localeCompare(b.date) || bookingTime(a).localeCompare(bookingTime(b)))[0];
  const href = (tab: string) => `/sala/people/${personId}?tab=${tab}`;
  return <section aria-labelledby="student-summary" className="space-y-5">
    <h2 id="student-summary" className="text-lg font-semibold">Resumen</h2>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {canReadRoutines ? <DashboardCard title="Rutina" icon={Dumbbell} href={href('routine')} action={canManageRoutines && active ? (routine || !routines.isSuccess ? 'Ver / editar rutina' : 'Crear rutina') : 'Ver rutina'}>
        {!active ? <p>Sin participación activa</p> : <DashboardFeedback query={routines}>{routine ? <><p className="font-semibold text-emerald-700">Activa</p><p>{routine.days.length} {routine.days.length === 1 ? 'día' : 'días'}</p></> : <p className="font-semibold">Sin rutina activa</p>}</DashboardFeedback>}
      </DashboardCard> : null}
      <DashboardCard title="Turnos" icon={CalendarDays} href={href('turns')} action="Gestionar turnos">
        <DashboardFeedback query={fixed}>{currentFixed ? <div><p className="text-muted-foreground">Turno fijo</p><p className="font-semibold">{weekdays[currentFixed.scheduleSlot?.weekday ?? ''] ?? currentFixed.scheduleSlot?.weekday ?? 'Día'} · {bookingTime(currentFixed)}</p></div> : <p>Sin turno fijo</p>}</DashboardFeedback>
        <DashboardFeedback query={reservations}>{nextReservation ? <div><p className="text-muted-foreground">Próxima reserva</p><p className="font-semibold">{formatOperationalDate(nextReservation.date)} · {bookingTime(nextReservation)}</p></div> : <p>Sin reservas próximas</p>}</DashboardFeedback>
      </DashboardCard>
      {canReadEvaluations ? <DashboardCard title="Evaluación física" icon={Activity} href={href('evaluations')} action={canManageEvaluations && active && evaluations.isSuccess && !latestEvaluation ? 'Crear evaluación' : 'Ver evaluaciones'}>
        <DashboardFeedback query={evaluations}>{latestEvaluation ? <p className="font-semibold">Última: {formatOperationalDate(latestEvaluation.evaluationDate)}</p> : <p>Sin evaluaciones</p>}</DashboardFeedback>
      </DashboardCard> : null}
      {canReadPayments ? <SalaPaymentStatus personId={personId} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canUseFinance={permissions.includes('SALA_PAYMENT_MANAGE') && permissions.includes('FINANCE_OPERATIONAL_READ')}/> : null}
    </div>
  </section>;
}

function SalaPaymentStatus({ personId, canRegister, canUseFinance }: { personId: string; canRegister: boolean; canUseFinance: boolean }): React.JSX.Element {
  const payments = useQuery({ queryKey: ['sala', 'students'], queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    assertRoutineResponse(response);
    return response.data.data;
  } });
  const student = payments.data?.find(item => item.id === personId);
  const paid = student?.hasValidAccess;

  return <article className="rounded-md border border-border bg-surface p-5">
    <h3 className="flex items-center gap-2 font-semibold"><WalletCards aria-hidden="true" className="h-5 w-5"/>Pago</h3>
    <DashboardFeedback query={payments}><p className={`font-semibold ${paid ? 'text-emerald-700' : 'text-amber-800'}`}>{paid ? `Vigente hasta ${formatOperationalDate(student!.validUntil!)}` : 'Sin vigencia'}</p>
      {canRegister || canUseFinance ? <Link className="mt-3 inline-flex min-h-11 items-center rounded-md border px-3 text-sm" href={canUseFinance ? `/finance?view=income&personId=${personId}${!paid ? '&action=renew' : ''}` : `/sala/people/${personId}?tab=payments${!paid ? '&action=renew' : ''}`}>{paid ? 'Ver pagos' : canUseFinance ? 'Renovar' : 'Registrar renovación'}</Link> : null}
    </DashboardFeedback>
  </article>;
}

function Summary({ personId, active, fixed, reservations, canReadRoutines, canReadEvaluations }: { canReadEvaluations: boolean; canReadRoutines: boolean; personId: string; active?: Participation | undefined; fixed?: Fixed | undefined; reservations: Reservation[] }): React.JSX.Element { const cards = [{ label: 'Plan', value: active?.plan?.name ?? 'Sin plan' }, { label: 'Próxima reserva', value: reservations.find((item) => !item.cancelledAt) ? dateLabel(reservations.find((item) => !item.cancelledAt)!.date) : 'Sin reservas', href: 'reservations' }, { label: 'Turno fijo', value: fixed ? `${weekdays[fixed.scheduleSlot?.weekday ?? ''] ?? 'Día'} · ${(fixed.startTime ? (fixed.startTime.includes('T') ? fixed.startTime.slice(11, 16) : fixed.startTime) : fixed.scheduleSlot?.startTime) ?? '—'}` : 'Sin turno fijo', href: 'fixed' }, ...(canReadRoutines ? [{ label: 'Rutina', value: 'Consultar Rutina', href: 'routine' }] : []), ...(canReadEvaluations ? [{ label: 'Última evaluación física', value: 'Consultar Evaluaciones físicas', href: 'evaluations' }] : [])]; return <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => card.href ? <Link key={card.label} href={`/sala/people/${personId}?tab=${card.href}`} className="rounded-md border bg-white p-4 transition-colors hover:border-[#FCCC05]"><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 font-semibold">{card.value}</p></Link> : <article key={card.label} className="rounded-md border bg-white p-4"><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 font-semibold">{card.value}</p></article>)}</section>; }
function BookingForm({ professorLayout = false, title, date, setDate, services, servicesLoaded, availability, serviceId, setServiceId, slotId, setSlotId, startTime, setStartTime, disabled, onSubmit, submitLabel }: { professorLayout?: boolean; title: string; date: string; setDate: (value: string) => void; services: Service[]; servicesLoaded: boolean; availability: Array<{ slotId: string; scheduleSlotId?: string; startTime: string }>; serviceId: string; setServiceId: (value: string) => void; slotId: string; setSlotId: (value: string) => void; startTime: string; setStartTime: (value: string) => void; disabled: boolean; onSubmit: () => void; submitLabel: string }): React.JSX.Element { return <div><h2 className="text-xl font-semibold">{title}</h2>{servicesLoaded&&!services.length?<p className="mt-2 text-sm text-muted-foreground">Podés reservar Sala sin seleccionar un Servicio.</p>:null}<div className={`mt-4 grid gap-3 ${professorLayout ? 'sm:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-4'}`}><label className="text-sm">Fecha<input type="date" className="mt-1 h-10 w-full rounded border px-3" value={date} onChange={(event) => setDate(event.target.value)}/></label><label className="text-sm">Servicio (opcional)<select aria-label="Servicio" className="mt-1 h-10 w-full rounded border px-3" value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Sin servicio — Sala (60 min)</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="text-sm">Horario<select className="mt-1 h-10 w-full rounded border px-3" value={slotId && startTime ? `${slotId}:${startTime}` : ''} onChange={(event) => { const selected = availability.find((slot) => `${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}` === event.target.value); setSlotId(selected?.scheduleSlotId ?? selected?.slotId ?? ''); setStartTime(selected?.startTime ?? ''); }}><option value="">Seleccionar</option>{availability.filter((slot) => /:00$/.test(slot.startTime)).map((slot) => <option key={slot.slotId} value={`${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}`}>{slot.startTime}</option>)}</select></label><Button className="self-end" disabled={disabled || !slotId || !/:00$/.test(startTime)} onClick={onSubmit}>{submitLabel}</Button></div></div>; }
function operationalFuture(date: string, time: string): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const now = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date}T${time}:00` > `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}:${now.second}`;
}
function occurrenceWeek(value: string): { start: string; end: string } {
  if (!value) return { start: '', end: '' };
  const start = new Date(`${value}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function fixedOccurrences(booking: Fixed): string[] {
  const result: string[] = [];
  const day = new Date(`${today()}T00:00:00Z`);
  const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  for (let offset = 0; offset <= 30; offset++, day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if (names[day.getUTCDay()] === booking.scheduleSlot?.weekday && date >= booking.startDate.slice(0, 10) && (!booking.endDate || date <= booking.endDate.slice(0, 10)) && operationalFuture(date, bookingTime(booking))) result.push(date);
  }
  return result;
}
function nextFixedDate(weekday: string): string {
  const date = new Date(`${today()}T00:00:00Z`);
  const index = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(weekday);
  date.setUTCDate(date.getUTCDate() + (index - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}
function FixedBookingForm({ title, day, onDayChange, availability, slotId, startTime, onTimeChange, disabled, onSubmit, submitLabel, children }: {
  title: string; day: string; onDayChange: (day: string) => void;
  availability: Array<{ slotId: string; scheduleSlotId?: string; startTime: string }>;
  slotId: string; startTime: string; onTimeChange: (slotId: string, time: string) => void;
  disabled: boolean; onSubmit: () => void; submitLabel: string; children: React.ReactNode;
}): React.JSX.Element {
  const times = availability.filter(slot => /:00$/.test(slot.startTime));
  return <div><h2 className="text-xl font-semibold">{title}</h2>{children}<div className="mt-4 grid gap-3 sm:grid-cols-3">
    <label className="text-sm">Día<select className="mt-1 min-h-11 w-full rounded border px-3" value={day} onChange={event => onDayChange(event.target.value)}>{Object.entries(weekdays).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="text-sm">Horario<select className="mt-1 min-h-11 w-full rounded border px-3" value={slotId && startTime ? `${slotId}:${startTime}` : ''} onChange={event => { const selected = times.find(slot => `${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}` === event.target.value); onTimeChange(selected?.scheduleSlotId ?? selected?.slotId ?? '', selected?.startTime ?? ''); }}><option value="">Seleccionar</option>{times.map(slot => <option key={slot.slotId} value={`${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}`}>{slot.startTime}</option>)}</select></label>
    <Button className="self-end" disabled={disabled || !slotId || !/:00$/.test(startTime)} onClick={onSubmit}>{submitLabel}</Button>
  </div></div>;
}
function ReservationList({ rows, onCancel }: { rows: Reservation[]; onCancel: (id: string) => void }): React.JSX.Element { return <div className="mt-6"><h3 className="font-semibold">Reservas de la Persona</h3>{rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay reservas registradas.</p> : rows.map((row) => <div key={row.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{dateLabel(row.date)} · {bookingTime(row)} · {row.cancelledAt ? 'Cancelada' : 'Activa'}</span>{!row.cancelledAt ? <Button variant="secondary" onClick={() => onCancel(row.id)}>Cancelar</Button> : null}</div>)}</div>; }
