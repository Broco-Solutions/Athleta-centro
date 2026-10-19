'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, CalendarDays, Dumbbell, ShieldAlert, WalletCards, type LucideIcon } from 'lucide-react';
import { formatOperationalDate } from '../../lib/operational-date';
import { Button } from '@athleta/ui';
import { getSalaClinicalIndicationProjection, listPersonPhysicalEvaluations, listSalaStudents, cancelSalaReservation, changeFixedSalaBooking, createFixedSalaBooking, createSalaExerciseDefinition, duplicateSalaRoutine, updateSalaExerciseDefinition, retireSalaExerciseDefinition, createSalaReservation, endFixedSalaBooking, getPerson, getSalaAvailability, listFixedSalaBookings, listPersonSalaParticipations, listPersonSalaRoutines, listSalaExerciseDefinitions, listSalaRoutineTemplates, listSalaReservations, listPersonSalaServices, replaceSalaRoutine, type ChangeFixedBookingDto, type FixedBookingDto, type OneOffReservationDto } from '@athleta/api-client';
import { currentSession } from '../auth/auth';
import { WorkspaceShell } from '../auth/workspace-shell';
import { RoutinePanel, type RoutineApi } from './routine-panel';
import { PhysicalEvaluationPanel } from './physical-evaluation-panel';
import { SalaPaymentPanel } from '../finance/sala-payment-panel';
import { ParticipationManagement } from './participation-management';

type Participation = { id: string; objective?: string | null; mainProfessorId?: string; planId?: string; endDate?: string | null; mainProfessor?: { id?: string; firstName: string; lastName: string } | null; plan?: { id: string; name: string; monthlyAmount: string } };
type Slot = { id: string; scheduleSlotId?: string; startTime: string; weekday?: string };
type Fixed = { id: string; startTime?: string | null; startDate: string; endDate?: string | null; scheduleSlot?: Slot; serviceType?: Service | null };
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

export function SalaPersonWorkspace({ personId }: { personId: string }): React.JSX.Element {
  const search = useSearchParams(); const requestedTab = search.get('tab') ?? 'summary'; const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const csrf = session.data?.csrfToken ?? ''; const client = useQueryClient();
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const tab = isProfessorOnly && ['reservations', 'fixed'].includes(requestedTab) ? 'turns' : requestedTab === 'payments' && !isProfessorOnly ? 'summary' : requestedTab;
  const person = useQuery({ queryKey: ['person', personId], queryFn: async () => (await getPerson(personId, { credentials: 'include' })).data.data });
  const participations = useQuery({ queryKey: ['sala-participations', personId], queryFn: async () => salaData(await listPersonSalaParticipations(personId, options(csrf))), enabled: Boolean(csrf) }); const active = participations.data?.find((item) => !item.endDate);
  const fixed = useQuery({ queryKey: ['sala-fixed', personId], queryFn: async () => salaData(await listFixedSalaBookings(personId, options(csrf))), enabled: Boolean(csrf) }); const reservations = useQuery({ queryKey: ['sala-reservations', personId], queryFn: async () => salaData(await listSalaReservations(personId, options(csrf))), enabled: Boolean(csrf) });
  const [date, setDate] = useState(today); const [serviceId, setServiceId] = useState(''); const [slotId, setSlotId] = useState(''); const [startTime, setStartTime] = useState(''); const [editingFixed, setEditingFixed] = useState<Fixed | null>(null);
  const services = useQuery({ queryKey: ['sala', 'person-services', personId], queryFn: async () => { const response = await listPersonSalaServices(personId, { credentials: 'include' }); assertRoutineResponse(response); return response.data.data ?? []; }, enabled: Boolean(active) }); const availability = useQuery({ queryKey: ['sala', 'availability', date], queryFn: async () => salaData(await getSalaAvailability({ date }, { credentials: 'include' })) });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['sala-fixed', personId] }), client.invalidateQueries({ queryKey: ['sala-reservations', personId] })]); };
  const bookingBase = { personId, salaParticipationId: active?.id ?? '', scheduleSlotId: slotId, serviceTypeId: serviceId, startTime };
  const reserve = useMutation({ mutationFn: async () => { const payload: OneOffReservationDto = { ...bookingBase, date }; return assertBookingResponse(await createSalaReservation(payload, options(csrf))); }, onSuccess: refresh }); const createFixed = useMutation({ mutationFn: async () => { const payload: FixedBookingDto = { ...bookingBase, startDate: date }; return assertBookingResponse(await createFixedSalaBooking(payload, options(csrf))); }, onSuccess: refresh }); const updateFixed = useMutation({ mutationFn: async () => { if (editingFixed) { const payload: ChangeFixedBookingDto = { ...bookingBase, startDate: date, id: editingFixed.id }; assertBookingResponse(await changeFixedSalaBooking(editingFixed.id, payload, options(csrf))); } }, onSuccess: async () => { setEditingFixed(null); await refresh(); } }); const finishFixed = useMutation({ mutationFn: (id: string) => endFixedSalaBooking(id, { endDate: date }, options(csrf)), onSuccess: refresh }); const cancel = useMutation({ mutationFn: (id: string) => cancelSalaReservation(id, options(csrf)), onSuccess: refresh });
  const routineApi: RoutineApi = {
    list: async (id, requestOptions) => { const response = await listPersonSalaRoutines(id, requestOptions); assertRoutineResponse(response); return response.data.data; },
    templates: async (requestOptions) => { const response = await listSalaRoutineTemplates(requestOptions); assertRoutineResponse(response); return response.data.data; },
    exercises: async (requestOptions) => { const response = await listSalaExerciseDefinitions(requestOptions); assertRoutineResponse(response); return response.data.data; },
    create: async (input, requestOptions) => assertRoutineResponse(await replaceSalaRoutine(input, requestOptions)),
    replace: async (_id, input, requestOptions) => assertRoutineResponse(await replaceSalaRoutine(input, requestOptions)),
    duplicate: async (id, requestOptions) => assertRoutineResponse(await duplicateSalaRoutine(id, requestOptions)),
    createExercise: async (input, requestOptions) => {
      const response = await createSalaExerciseDefinition(input, requestOptions);
      assertRoutineResponse(response);
      const created = response.data?.data;
      if (!created || typeof created.id !== 'string' || !created.id || typeof created.name !== 'string' || typeof created.isActive !== 'boolean') {
        throw new Error('La respuesta no contiene el ejercicio creado.');
      }
      return created;
    },
    updateExercise: async (id, input, requestOptions) => assertRoutineResponse(await updateSalaExerciseDefinition(id, input, requestOptions)),
    retireExercise: async (id, input, requestOptions) => assertRoutineResponse(await retireSalaExerciseDefinition(id, input, requestOptions)),
  };
  const permissions = session.data?.permissions ?? [];
  const canReadEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_READ');
  const canManageEvaluations = permissions.includes('SALA_PHYSICAL_EVALUATION_MANAGE');
  const canManagePhysicalTests = permissions.includes('SALA_PHYSICAL_TEST_CATALOG_MANAGE');
  const canReadRoutines = session.data?.permissions.includes('SALA_ROUTINE_READ') ?? false;
  const canManageRoutines = session.data?.permissions.includes('SALA_ROUTINE_MANAGE') ?? false;
  if (person.isLoading) return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><p>Cargando Persona…</p></WorkspaceShell>; if (person.isError || !person.data) return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><p role="alert">No pudimos cargar la Persona.</p></WorkspaceShell>;
  const p = person.data; const canReadPayments = session.data?.permissions.includes('SALA_PAYMENT_READ') ?? false; const links = isProfessorOnly
    ? [['summary', 'Resumen'], ...(canReadRoutines ? [['routine', 'Rutina']] : []), ...(canReadEvaluations ? [['evaluations', 'Evaluaciones']] : []), ['turns', 'Turnos'], ...(canReadPayments ? [['payments', 'Pagos']] : [])]
    : [['summary', 'Resumen'], ['reservations', 'Reservas'], ['fixed', 'Turno fijo'], ...(canReadRoutines ? [['routine', 'Rutina']] : []), ...(canReadEvaluations ? [['evaluations', 'Evaluaciones físicas']] : [])];
  return <WorkspaceShell active={isProfessorOnly ? 'sala-students' : 'sala-agenda'}><div className="mx-auto min-w-0 max-w-7xl space-y-5"><nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href={isProfessorOnly ? '/students' : '/sala'}>{isProfessorOnly ? 'Alumnos' : 'Sala'}</Link> <span aria-hidden="true">/</span> <strong className="text-foreground">{p.firstName} {p.lastName}</strong></nav>{isProfessorOnly ? <header className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row">
        <div className="min-w-0 flex-1"><h1 className="break-words text-2xl font-semibold uppercase tracking-wide sm:text-3xl">{p.firstName} {p.lastName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">DNI {p.dni}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{active?.plan?.name ?? 'Sin plan'} · Profesor principal: {active?.mainProfessor ? `${active.mainProfessor.firstName} ${active.mainProfessor.lastName}` : 'Sin asignar'}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-muted text-muted-foreground'}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-current"/>{active ? 'Participación activa' : 'Sin participación activa'}</span>
      </div>
    </header> : <header className="rounded-md border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{isProfessorOnly ? 'Alumno' : 'Workspace Sala'}</p><h1 className="text-3xl font-semibold">{p.firstName} {p.lastName}</h1><p className="mt-1 text-sm">DNI {p.dni} · <span className={active ? 'font-medium text-emerald-700' : 'text-muted-foreground'}>{active ? 'Participación activa' : 'Sin participación activa'}</span></p></div><div className="flex flex-wrap gap-2">{!isProfessorOnly ? <Link href={`/people/${personId}`} className="rounded-md border px-3 py-2 text-sm">Ver ficha de Persona</Link> : null}{p.isClinicalPatient ? <Link href={`/clinic?personId=${personId}`} className="rounded-md border px-3 py-2 text-sm">Ver Clínica</Link> : null}</div></div></header>}<nav aria-label="Secciones del alumno en Sala" className="flex gap-1 overflow-x-auto border-b">{links.map(([key, label]) => <Link key={key} aria-current={tab === key ? 'page' : undefined} href={`/sala/people/${personId}?tab=${key}`} className={`whitespace-nowrap border-b-2 min-h-11 px-3 py-3 text-sm font-medium ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>{label}</Link>)}</nav>{tab === 'summary' && active ? <ParticipationManagement personId={personId} active={active} roles={session.data?.roles ?? []} permissions={session.data?.permissions ?? []} csrfToken={csrf}/> : null}{tab === 'summary' && isProfessorOnly ? <ProfessorDashboard personId={personId} active={active} fixed={fixed} reservations={reservations} permissions={session.data?.permissions ?? []} csrfToken={csrf}/> : null}{tab === 'summary' && !isProfessorOnly ? <><Summary personId={personId} active={active} fixed={fixed.data?.find((item) => !item.endDate)} reservations={reservations.data ?? []} canReadRoutines={canReadRoutines} canReadEvaluations={canReadEvaluations}/>{canReadPayments ? <SalaPaymentStatus personId={personId} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canUseFinance={permissions.includes('SALA_PAYMENT_MANAGE') && permissions.includes('FINANCE_OPERATIONAL_READ')}/> : null}</> : null}{(tab === 'reservations' || (isProfessorOnly && tab === 'turns')) ? <section className="rounded-md border bg-white p-5"><BookingForm professorLayout={isProfessorOnly} title="Nueva reserva puntual" date={date} setDate={setDate} services={services.data ?? []} servicesLoaded={Boolean(active)&&services.isSuccess} availability={availability.data ?? []} serviceId={serviceId} setServiceId={setServiceId} slotId={slotId} setSlotId={setSlotId} startTime={startTime} setStartTime={setStartTime} disabled={!active || reserve.isPending || !services.data?.some(service=>service.id===serviceId)} onSubmit={() => reserve.mutate()} submitLabel="Crear reserva"/>{reserve.error instanceof Error ? <p role="alert" className="mt-2 text-sm text-red-700">{reserve.error.message}</p> : null}<ReservationList rows={reservations.data ?? []} onCancel={(id) => cancel.mutate(id)}/></section> : null}{(tab === 'fixed' || (isProfessorOnly && tab === 'turns')) ? <section className="rounded-md border bg-white p-5">{isProfessorOnly ? <h2 className="mb-4 text-xl font-semibold">Turno fijo</h2> : null}<BookingForm professorLayout={isProfessorOnly} title={editingFixed ? 'Modificar turno fijo' : 'Crear turno fijo'} date={date} setDate={setDate} services={services.data ?? []} servicesLoaded={Boolean(active)&&services.isSuccess} availability={availability.data ?? []} serviceId={serviceId} setServiceId={setServiceId} slotId={slotId} setSlotId={setSlotId} startTime={startTime} setStartTime={setStartTime} disabled={!active || createFixed.isPending || updateFixed.isPending || !services.data?.some(service=>service.id===serviceId)} onSubmit={() => editingFixed ? updateFixed.mutate() : createFixed.mutate()} submitLabel={editingFixed ? 'Guardar cambios' : 'Crear turno fijo'}/>{(createFixed.error ?? updateFixed.error) instanceof Error ? <p role="alert" className="mt-2 text-sm text-red-700">{(createFixed.error ?? updateFixed.error as Error).message}</p> : null}<div className="mt-5 space-y-2">{(fixed.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No existe un turno fijo.</p> : (fixed.data ?? []).map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>{item.serviceType?.name??'Sala'} · {item.scheduleSlot?.weekday ?? 'Día'} · {(item.startTime ? (item.startTime.includes('T') ? item.startTime.slice(11, 16) : item.startTime) : item.scheduleSlot?.startTime) ?? '—'} · Desde {dateLabel(item.startDate)}{item.endDate ? ` · Finalizado ${dateLabel(item.endDate)}` : ''}</span>{!item.endDate ? <span className="flex gap-2"><Button variant="secondary" onClick={() => { setEditingFixed(item); setServiceId(services.data?.find(service=>service.id===item.serviceType?.id)?.id??''); setDate(item.startDate.slice(0, 10)); setStartTime(item.startTime ? (item.startTime.includes('T') ? item.startTime.slice(11, 16) : item.startTime) : item.scheduleSlot?.startTime ?? ''); setSlotId(item.scheduleSlot?.id ?? ''); }}>Modificar</Button><Button variant="secondary" onClick={() => finishFixed.mutate(item.id)}>Finalizar</Button></span> : null}</article>)}</div></section> : null}{isProfessorOnly && tab === 'payments' && canReadPayments && participations.isSuccess ? <SalaPaymentPanel key={search.get('action') ?? 'payments'} personId={personId} csrfToken={csrf} activePlan={active?.plan} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canAdjust={false} canReverse={false} defaultOpen={search.get('action') === 'renew'}/> : null}{tab === 'routine' && canReadRoutines ? <RoutinePanel personId={personId} participationId={active?.id ?? ''} csrfToken={csrf} api={routineApi} canManage={canManageRoutines}/> : null}{tab === 'evaluations' && canReadEvaluations ? <PhysicalEvaluationPanel personId={personId} participationId={active?.id ?? null} professorId={session.data?.user?.id ?? ''} csrfToken={csrf} canManage={canManageEvaluations} canManageTestCatalog={canManagePhysicalTests}/> : null}</div></WorkspaceShell>;
}
type DashboardQuery<T> = { data: T[] | undefined; isPending: boolean; isError: boolean };
const trainingConditions = {
  DO_NOT_TRAIN: { label: 'No entrenar', priority: 0, style: 'border-red-200 bg-red-50 text-red-800' },
  RESTRICTED: { label: 'Con restricciones', priority: 1, style: 'border-amber-200 bg-amber-50 text-amber-800' },
  NO_RESTRICTIONS: { label: 'Sin restricciones', priority: 2, style: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};
const bookingTime = (item: { startTime?: string | null; scheduleSlot?: Slot }): string => item.startTime ? (item.startTime.includes('T') ? item.startTime.slice(11, 16) : item.startTime) : item.scheduleSlot?.startTime ?? '—';
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
  const canReadIndications = permissions.includes('SALA_CLINICAL_INDICATION_READ');
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: async () => {
    const response = await listPersonSalaRoutines(personId, options(csrfToken)); assertRoutineResponse(response); return response.data.data;
  }, enabled: canReadRoutines });
  const evaluations = useQuery({ queryKey: ['sala', 'physical-evaluations', personId], queryFn: async () => {
    const response = await listPersonPhysicalEvaluations(personId, { credentials: 'include' }); assertRoutineResponse(response); return response.data.data;
  }, enabled: canReadEvaluations });
  const indications = useQuery({ queryKey: ['sala', 'clinical-indications', personId], queryFn: async () => {
    const response = await getSalaClinicalIndicationProjection(personId, { credentials: 'include' }); assertRoutineResponse(response); return response.data.data;
  }, enabled: canReadIndications });
  const operationalToday = today();
  const routine = routines.data?.find(item => item.status === 'ACTIVE');
  const latestEvaluation = [...(evaluations.data ?? [])].sort((a, b) => b.evaluationDate.localeCompare(a.evaluationDate))[0];
  const currentFixed = fixed.data?.find(item => !item.endDate);
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
    {canReadIndications ? <section aria-labelledby="training-indications" className="rounded-md border border-border bg-surface p-5">
      <h3 id="training-indications" className="mb-4 flex items-center gap-2 font-semibold"><ShieldAlert aria-hidden="true" className="h-5 w-5"/>Indicaciones para entrenar</h3>
      <DashboardFeedback query={indications}>{indications.data?.length ? <div className="space-y-3">{[...indications.data].sort((a, b) => trainingConditions[a.trainingCondition].priority - trainingConditions[b.trainingCondition].priority).map(indication => <article key={indication.id} className={`space-y-2 break-words rounded-md border p-4 text-sm ${trainingConditions[indication.trainingCondition].style}`}>
        <h4 className="flex items-center gap-2 font-semibold"><ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0"/>{trainingConditions[indication.trainingCondition].label}</h4>
        {indication.affectedArea ? <p className="font-medium">{indication.affectedArea}</p> : null}
        {indication.instructions ? <p className="whitespace-pre-wrap">{indication.instructions}</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1">{indication.responsibleProfessional ? <p>Profesional: {indication.responsibleProfessional.firstName} {indication.responsibleProfessional.lastName}</p> : null}<p>Actualizado {formatOperationalDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(indication.lastUpdate)))}</p></div>
      </article>)}</div> : <p className="text-sm text-muted-foreground">Sin indicaciones especiales para entrenar.</p>}</DashboardFeedback>
    </section> : null}
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

function Summary({ personId, active, fixed, reservations, canReadRoutines, canReadEvaluations }: { canReadEvaluations: boolean; canReadRoutines: boolean; personId: string; active?: Participation | undefined; fixed?: Fixed | undefined; reservations: Reservation[] }): React.JSX.Element { const cards = [{ label: 'Plan', value: active?.plan?.name ?? 'Sin plan' }, { label: 'Próxima reserva', value: reservations.find((item) => !item.cancelledAt) ? dateLabel(reservations.find((item) => !item.cancelledAt)!.date) : 'Sin reservas', href: 'reservations' }, { label: 'Turno fijo', value: fixed ? `${fixed.scheduleSlot?.weekday ?? 'Día'} · ${(fixed.startTime ? (fixed.startTime.includes('T') ? fixed.startTime.slice(11, 16) : fixed.startTime) : fixed.scheduleSlot?.startTime) ?? '—'}` : 'Sin turno fijo', href: 'fixed' }, ...(canReadRoutines ? [{ label: 'Rutina', value: 'Consultar Rutina', href: 'routine' }] : []), ...(canReadEvaluations ? [{ label: 'Última evaluación física', value: 'Consultar Evaluaciones físicas', href: 'evaluations' }] : [])]; return <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => card.href ? <Link key={card.label} href={`/sala/people/${personId}?tab=${card.href}`} className="rounded-md border bg-white p-4 transition-colors hover:border-[#FCCC05]"><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 font-semibold">{card.value}</p></Link> : <article key={card.label} className="rounded-md border bg-white p-4"><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 font-semibold">{card.value}</p></article>)}</section>; }
function BookingForm({ professorLayout = false, title, date, setDate, services, servicesLoaded, availability, serviceId, setServiceId, slotId, setSlotId, startTime, setStartTime, disabled, onSubmit, submitLabel }: { professorLayout?: boolean; title: string; date: string; setDate: (value: string) => void; services: Service[]; servicesLoaded: boolean; availability: Array<{ slotId: string; scheduleSlotId?: string; startTime: string }>; serviceId: string; setServiceId: (value: string) => void; slotId: string; setSlotId: (value: string) => void; startTime: string; setStartTime: (value: string) => void; disabled: boolean; onSubmit: () => void; submitLabel: string }): React.JSX.Element { return <div><h2 className="text-xl font-semibold">{title}</h2>{servicesLoaded&&!services.length?<p className="mt-2 text-sm text-muted-foreground">El Plan actual no tiene servicios disponibles para nuevas reservas.</p>:null}<div className={`mt-4 grid gap-3 ${professorLayout ? 'sm:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-4'}`}><label className="text-sm">Fecha<input type="date" className="mt-1 h-10 w-full rounded border px-3" value={date} onChange={(event) => setDate(event.target.value)}/></label><label className="text-sm">Servicio<select className="mt-1 h-10 w-full rounded border px-3" value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Seleccionar</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="text-sm">Horario<select className="mt-1 h-10 w-full rounded border px-3" value={slotId && startTime ? `${slotId}:${startTime}` : ''} onChange={(event) => { const selected = availability.find((slot) => `${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}` === event.target.value); setSlotId(selected?.scheduleSlotId ?? selected?.slotId ?? ''); setStartTime(selected?.startTime ?? ''); }}><option value="">Seleccionar</option>{availability.filter((slot) => /:(00|30)$/.test(slot.startTime)).map((slot) => <option key={slot.slotId} value={`${slot.scheduleSlotId ?? slot.slotId}:${slot.startTime}`}>{slot.startTime}</option>)}</select></label><Button className="self-end" disabled={disabled || !serviceId || !slotId || !/:(00|30)$/.test(startTime)} onClick={onSubmit}>{submitLabel}</Button></div></div>; }
function ReservationList({ rows, onCancel }: { rows: Reservation[]; onCancel: (id: string) => void }): React.JSX.Element { return <div className="mt-6"><h3 className="font-semibold">Reservas de la Persona</h3>{rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay reservas registradas.</p> : rows.map((row) => <div key={row.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{dateLabel(row.date)} · {row.scheduleSlot?.startTime ?? '—'} · {row.cancelledAt ? 'Cancelada' : 'Activa'}</span>{!row.cancelledAt ? <Button variant="secondary" onClick={() => onCancel(row.id)}>Cancelar</Button> : null}</div>)}</div>; }
