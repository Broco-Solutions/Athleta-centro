'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClinicalAppointmentOperationalDto, ClinicalProfessionalSummaryDto } from '@athleta/api-client';
import { AlertTriangle, CalendarDays, Check, Clock3 } from 'lucide-react';
import {
  changeClinicalAppointmentStatus,
  ClinicApiError,
  fetchClinicalAppointments,
  fetchClinicalProfessionals,
  moveClinicalAppointment,
  type AppointmentStatus,
  type ClinicalCoverage,
} from './clinic-api';
import {
  addCalendarDays,
  clinicAgendaRange,
  clinicDateKey,
  clinicLocalDateTimeToIso,
  formatClinicDate,
  formatClinicTime,
  operationalDate,
  startOfOperationalWeek,
  toClinicDateTimeLocal,
} from './clinic-dates';

const statusLabels: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendado',
  ATTENDED: 'Atendido',
  CANCELLED: 'Cancelado',
  ABSENT: 'Ausente',
};

const statusClasses: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-blue-200 bg-blue-50 text-blue-800',
  ATTENDED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-700',
  ABSENT: 'border-amber-200 bg-amber-50 text-amber-900',
};

function errorMessage(error: unknown): string {
  const code = error instanceof ClinicApiError ? error.code : '';
  const messages: Record<string, string> = {
    ATTENTION_HAS_DEPENDENCIES: 'La Atención posee contenido o dependencias. Resolvelas antes de corregir el Turno.',
    CLINIC_ATTENTION_COVERAGE_REQUIRED: 'Seleccioná Particular u Obra social para registrar la Atención.',
    CLINIC_APPOINTMENT_NOT_FUTURE: 'La nueva fecha y hora debe ser futura.',
    CONCURRENT_MODIFICATION: 'El Turno cambió mientras lo estabas editando. Actualizá la agenda e intentá de nuevo.',
  };
  return messages[code] ?? 'No pudimos actualizar el Turno.';
}

function professionalName(professional: Pick<ClinicalProfessionalSummaryDto, 'firstName' | 'lastName'>): string {
  return `${professional.firstName} ${professional.lastName}`;
}

function AppointmentActions({
  appointment,
  professionals,
  csrfToken,
}: {
  appointment: ClinicalAppointmentOperationalDto;
  professionals: ClinicalProfessionalSummaryDto[];
  csrfToken: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [targetStatus, setTargetStatus] = useState<AppointmentStatus>(appointment.status);
  const [coverage, setCoverage] = useState<ClinicalCoverage | ''>('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [startAt, setStartAt] = useState(() => toClinicDateTimeLocal(appointment.startAt));
  const [durationMinutes, setDurationMinutes] = useState(appointment.durationMinutes);
  const [professionalId, setProfessionalId] = useState(appointment.professionalId);
  const [operationalNote, setOperationalNote] = useState(appointment.operationalNote ?? '');
  const [notice, setNotice] = useState('');

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['clinic', 'appointments'] });
  };
  const statusMutation = useMutation({
    mutationFn: () => changeClinicalAppointmentStatus(
      appointment.id,
      targetStatus,
      targetStatus === 'ATTENDED' ? coverage || undefined : undefined,
      csrfToken,
    ),
    onSuccess: async (result) => {
      setTargetStatus(result.status);
      setCoverage('');
      setNotice(result.status === 'ATTENDED' && !result.hasEvolution
        ? 'Turno Atendido. La Atención quedó sin Evolución; podés completarla después.'
        : 'Estado actualizado.');
      await refresh();
    },
  });
  const rescheduleMutation = useMutation({
    mutationFn: () => moveClinicalAppointment(appointment.id, {
      professionalId,
      startAt: clinicLocalDateTimeToIso(startAt),
      durationMinutes,
      ...(operationalNote.trim() ? { operationalNote: operationalNote.trim() } : {}),
    }, csrfToken),
    onSuccess: async (result) => {
      setNotice(result.overlapCount > 0
        ? `Turno reprogramado. Coincide con ${result.overlapCount} Turno(s) del profesional.`
        : 'Turno reprogramado.');
      setIsRescheduling(false);
      await refresh();
    },
  });
  const statusError = statusMutation.isError ? errorMessage(statusMutation.error) : '';
  const rescheduleError = rescheduleMutation.isError ? errorMessage(rescheduleMutation.error) : '';

  return (
    <div className="mt-4 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium">
          Corregir estado
          <select
            aria-label={`Nuevo estado de ${appointment.person.firstName} ${appointment.person.lastName}`}
            className="h-10 rounded-md border bg-white px-3"
            value={targetStatus}
            onChange={(event) => setTargetStatus(event.target.value as AppointmentStatus)}
          >
            {(Object.keys(statusLabels) as AppointmentStatus[]).map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        </label>
        {targetStatus === 'ATTENDED' && appointment.status !== 'ATTENDED' ? (
          <label className="grid gap-1 text-sm font-medium">
            Cobertura
            <select
              aria-label={`Cobertura de ${appointment.person.firstName} ${appointment.person.lastName}`}
              className="h-10 rounded-md border bg-white px-3"
              required
              value={coverage}
              onChange={(event) => setCoverage(event.target.value as ClinicalCoverage | '')}
            >
              <option value="">Seleccionar cobertura</option>
              <option value="PRIVATE">Particular</option>
              <option value="SOCIAL_WORK">Obra social</option>
            </select>
          </label>
        ) : <span />}
        <button
          type="button"
          className="h-10 rounded-md bg-[#FCCC05] px-4 text-sm font-semibold text-black disabled:opacity-50"
          disabled={statusMutation.isPending || targetStatus === appointment.status || (targetStatus === 'ATTENDED' && !coverage)}
          onClick={() => statusMutation.mutate()}
        >
          {statusMutation.isPending ? 'Actualizando…' : 'Aplicar estado'}
        </button>
      </div>
      {appointment.status === 'SCHEDULED' ? (
        <div className="mt-3">
          <button type="button" className="text-sm font-medium underline" onClick={() => setIsRescheduling((value) => !value)}>
            {isRescheduling ? 'Cerrar reprogramación' : 'Reprogramar Turno'}
          </button>
          {isRescheduling ? (
            <div className="mt-3 grid gap-3 rounded-md bg-slate-50 p-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Fecha y hora
                <input className="h-10 rounded-md border bg-white px-3" type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">Duración en minutos
                <input className="h-10 rounded-md border bg-white px-3" type="number" min={1} required value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
              </label>
              <label className="grid gap-1 text-sm font-medium">Profesional clínico
                <select className="h-10 rounded-md border bg-white px-3" required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
                  {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professionalName(professional)}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Nota operativa
                <input className="h-10 rounded-md border bg-white px-3" maxLength={500} value={operationalNote} onChange={(event) => setOperationalNote(event.target.value)} />
              </label>
              <button
                type="button"
                className="h-10 rounded-md bg-[#FCCC05] px-4 text-sm font-semibold text-black disabled:opacity-50 md:col-span-2"
                disabled={rescheduleMutation.isPending || !startAt || durationMinutes < 1 || !professionalId}
                onClick={() => rescheduleMutation.mutate()}
              >
                {rescheduleMutation.isPending ? 'Guardando…' : 'Guardar reprogramación'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {statusError || rescheduleError ? <p role="alert" className="mt-3 text-sm text-red-700">{statusError || rescheduleError}</p> : null}
      {notice ? <p aria-live="polite" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p> : null}
    </div>
  );
}

function AppointmentCard({
  appointment,
  professionals,
  csrfToken,
  canManage,
}: {
  appointment: ClinicalAppointmentOperationalDto;
  professionals: ClinicalProfessionalSummaryDto[];
  csrfToken: string;
  canManage: boolean;
}): React.JSX.Element {
  const start = new Date(appointment.startAt).getTime();
  const end = start + appointment.durationMinutes * 60_000;
  const now = Date.now();
  const temporalLabel = now < start ? 'Próximo' : now < end ? 'En curso' : 'Pasado';
  const isPending = appointment.status === 'SCHEDULED' && new Date(appointment.startAt) < new Date();
  return (
    <article className="rounded-md border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} /> {formatClinicTime(appointment.startAt)} · {appointment.durationMinutes} min</p>
          <h4 className="mt-1 text-lg font-semibold">{appointment.person.firstName} {appointment.person.lastName}</h4>
          <p className="text-sm text-muted-foreground">DNI {appointment.person.dni} · {professionalName(appointment.professional)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[appointment.status]}`}>{statusLabels[appointment.status]}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{temporalLabel}</span>
        <Link className="font-medium underline" href={`/clinic?tab=Paciente&personId=${appointment.personId}`}>Abrir ficha</Link>
      </div>
      {appointment.operationalNote ? <p className="mt-3 text-sm">{appointment.operationalNote}</p> : null}
      {isPending ? <p className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-800"><AlertTriangle size={16} /> Agendado pasado: requiere actualización manual.</p> : null}
      {appointment.status === 'ATTENDED' && !appointment.hasEvolution ? <p className="mt-3 flex items-center gap-2 text-sm text-amber-800"><AlertTriangle size={16} /> Atención sin Evolución.</p> : null}
      {appointment.coverage ? <p className="mt-2 text-xs text-muted-foreground">Cobertura: {appointment.coverage === 'PRIVATE' ? 'Particular' : 'Obra social'}</p> : null}
      {canManage ? <AppointmentActions appointment={appointment} professionals={professionals} csrfToken={csrfToken} /> : null}
    </article>
  );
}

export function ClinicalAgenda({
  personId,
  csrfToken,
  canManage,
}: {
  personId?: string;
  csrfToken: string;
  canManage: boolean;
}): React.JSX.Element {
  const [date, setDate] = useState(operationalDate);
  const [view, setView] = useState<'DAY' | 'WEEK'>('DAY');
  const [showPending, setShowPending] = useState(false);
  const [professionalId, setProfessionalId] = useState('');
  const professionals = useQuery({
    queryKey: ['clinic', 'professionals'],
    queryFn: fetchClinicalProfessionals,
  });
  const selectedProfessionalId = professionals.isError ? '' : professionalId;
  const range = clinicAgendaRange(date, view);
  const appointments = useQuery({
    queryKey: ['clinic', 'appointments', personId ?? '', date, view, showPending, selectedProfessionalId],
    queryFn: () => fetchClinicalAppointments(showPending
      ? { ...(personId ? { personId } : {}), ...(selectedProfessionalId ? { professionalId: selectedProfessionalId } : {}), pendingPastScheduled: 'YES' }
      : { ...(personId ? { personId } : {}), ...(selectedProfessionalId ? { professionalId: selectedProfessionalId } : {}), ...range }),
  });
  const grouped = useMemo(() => {
    const result = new Map<string, ClinicalAppointmentOperationalDto[]>();
    for (const appointment of appointments.data ?? []) {
      const key = clinicDateKey(appointment.startAt);
      result.set(key, [...(result.get(key) ?? []), appointment]);
    }
    return result;
  }, [appointments.data]);
  const visibleDays = useMemo(() => {
    if (showPending) return [...grouped.keys()];
    const first = view === 'WEEK' ? startOfOperationalWeek(date) : date;
    return Array.from({ length: view === 'WEEK' ? 7 : 1 }, (_, index) => addCalendarDays(first, index));
  }, [date, grouped, showPending, view]);

  return (
    <section aria-labelledby="clinical-agenda-heading" className="rounded-md border bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Planificación operativa</p>
          <h2 id="clinical-agenda-heading" className="text-xl font-semibold">Agenda Clínica</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canManage ? <Link className="inline-flex h-10 items-center rounded-md bg-[#FCCC05] px-4 text-sm font-semibold text-black" href={personId ? `/clinic/appointments/new?personId=${personId}` : '/clinic/appointments/new'}>Nuevo turno</Link> : null}
          <label className="grid gap-1 text-sm font-medium">Profesional
            <select className="h-10 max-w-full rounded-md border bg-white px-3" value={selectedProfessionalId} disabled={professionals.isPending || professionals.isError} onChange={(event) => setProfessionalId(event.target.value)}>
              <option value="">Todos los profesionales</option>
              {(professionals.isError ? [] : professionals.data ?? []).map((professional) => <option key={professional.id} value={professional.id}>{professionalName(professional)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Fecha
            <input aria-label="Fecha de agenda" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-md border px-3" disabled={showPending} />
          </label>
          <div className="flex rounded-md border p-1" aria-label="Vista de agenda">
            <button type="button" className={`rounded px-3 py-1.5 text-sm ${view === 'DAY' ? 'bg-[#FCCC05] font-semibold text-black' : ''}`} onClick={() => setView('DAY')}>Día</button>
            <button type="button" className={`rounded px-3 py-1.5 text-sm ${view === 'WEEK' ? 'bg-[#FCCC05] font-semibold text-black' : ''}`} onClick={() => setView('WEEK')}>Semana</button>
          </div>
          <button type="button" aria-pressed={showPending} className={`h-10 rounded-md border px-3 text-sm font-medium ${showPending ? 'border-amber-400 bg-amber-50 text-amber-900' : ''}`} onClick={() => setShowPending((value) => !value)}>
            Pendientes pasados
          </button>
        </div>
      </div>
      {professionals.isError ? <p aria-live="polite" className="mt-3 text-sm text-red-700">No se pudieron cargar los profesionales. La agenda sigue disponible sin filtro.</p> : null}
      {appointments.isLoading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Cargando agenda…</p> : null}
      {appointments.isError ? <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">No se pudo cargar la agenda.</p> : null}
      {!appointments.isLoading && !appointments.isError ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {visibleDays.length === 0 ? <p className="text-sm text-muted-foreground">No hay Turnos pendientes de actualización.</p> : visibleDays.map((day) => {
            const rows = grouped.get(day) ?? [];
            return (
              <section key={day} aria-label={`Turnos del ${day}`} className="min-w-0 rounded-md border bg-slate-50 p-3">
                <h3 className="flex items-center gap-2 font-semibold capitalize"><CalendarDays size={17} /> {formatClinicDate(`${day}T12:00:00-03:00`)}</h3>
                {rows.length ? <div className="mt-3 space-y-3">{rows.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} professionals={professionals.data ?? []} csrfToken={csrfToken} canManage={canManage} />
                ))}</div> : <p className="mt-3 text-sm text-muted-foreground">No hay Turnos para este día.</p>}
              </section>
            );
          })}
        </div>
      ) : null}
      {!appointments.isLoading && !appointments.isError && (appointments.data?.length ?? 0) > 0 ? <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} /> Los solapamientos se permiten y se informan al crear o reprogramar.</p> : null}
    </section>
  );
}
