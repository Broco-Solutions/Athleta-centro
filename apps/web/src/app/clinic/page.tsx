'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';

type Patient = { id: string; firstName: string; lastName: string; dni: string };
type Attention = { id: string; occurredAt: string; appointmentId?: string | null; professional?: { firstName: string; lastName: string } };
type Appointment = { id: string; startAt: string; durationMinutes: number; status: string; serviceType?: { name: string }; professional?: { firstName: string; lastName: string } };
type Treatment = { id: string; status: string; bodyAreaOrInjury: string; consultationReason: string; startDate: string; currentStage?: string | null };
type Study = { id: string; studyDate: string; studyType: string; description?: string | null; fileAsset?: unknown | null };
type Order = { id: string; reference: string; issueDate?: string | null; expirationDate?: string | null; isExpired?: boolean; socialWork?: { name: string } };
type Indication = { id: string; status: string; trainingCondition: string; affectedArea?: string | null; instructions?: string | null };
type Evaluation = { id: string; createdAt: string; results?: unknown[] };
type Row = { id: string };

const tabs = ['Agenda', 'Paciente', 'Tratamientos', 'Atenciones', 'Evaluaciones', 'Estudios', 'Obra social', 'Indicaciones'] as const;
type Tab = typeof tabs[number];
const isTab = (value: string | null): value is Tab => tabs.some((tab) => tab === value);
const get = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`/api/${path}`, { credentials: 'include' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'No pudimos cargar');
  return (body.data?.data ?? body.data) as T;
};
const displayDateTime = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
const statusLabel = (value: string) => ({ SCHEDULED: 'Programado', ATTENDED: 'Atendido', ABSENT: 'Ausente', CANCELLED: 'Cancelado', IN_PROGRESS: 'En curso', FINISHED: 'Finalizado', ACTIVE: 'Activa', CLOSED: 'Cerrada' } as Record<string, string>)[value] || value;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const nextDay = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

function List<T extends Row>({ query, empty, children }: { query: { isLoading: boolean; isError: boolean; data: T[] | undefined }; empty: string; children: (item: T) => React.ReactNode }): React.JSX.Element {
  if (query.isLoading) return <p className="mt-4">Cargando…</p>;
  if (query.isError) return <p role="alert" className="mt-4">No pudimos cargar esta sección. <button type="button" className="underline" onClick={() => window.location.reload()}>Reintentar</button></p>;
  if (!query.data?.length) return <p className="mt-4 text-sm text-muted-foreground">{empty}</p>;
  return <div className="mt-4 space-y-2">{query.data.map((item) => <React.Fragment key={item.id}>{children(item)}</React.Fragment>)}</div>;
}

function ClinicWorkspace(): React.JSX.Element {
  const search = useSearchParams();
  const personId = search?.get('personId') || '';
  const attentionId = search?.get('attentionId') || '';
  const tab: Tab = isTab(search?.get('tab') ?? null) ? search.get('tab') as Tab : 'Agenda';
  const [agendaDate, setAgendaDate] = useState(today);
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const patients = useQuery({ queryKey: ['clinic', 'patients', personId], queryFn: () => get<Patient[]>('clinic/patients'), enabled: Boolean(personId) });
  const patient = patients.data?.find((item) => item.id === personId);
  const appointmentPath = `clinic/appointments?${new URLSearchParams({ ...(personId ? { personId } : {}), from: agendaDate, to: nextDay(agendaDate) })}`;
  const listPath = tab === 'Agenda' ? appointmentPath : tab === 'Tratamientos' ? `clinic/treatments?personId=${personId}` : tab === 'Atenciones' ? `clinic/attentions?personId=${personId}` : tab === 'Estudios' ? `clinic/studies?personId=${personId}` : tab === 'Obra social' ? personId ? `clinic/orders?personId=${personId}` : 'clinic/social-works' : tab === 'Indicaciones' ? `clinic/indications?personId=${personId}` : '';
  const list = useQuery({ queryKey: ['clinic', tab, personId, agendaDate], queryFn: () => get<Row[]>(listPath), enabled: Boolean(listPath) && (!personId || Boolean(patient)) });
  const attentions = useQuery({ queryKey: ['clinic', 'attentions', personId], queryFn: () => get<Attention[]>(`clinic/attentions?personId=${personId}`), enabled: Boolean(patient) });
  const evaluations = useQuery({ queryKey: ['clinic', 'evaluations', attentionId], queryFn: () => get<Evaluation[]>(`clinic/attentions/${attentionId}/evaluations`), enabled: tab === 'Evaluaciones' && Boolean(attentionId) });
  const canManageAppointments = permissions.includes('CLINIC_APPOINTMENT_MANAGE');
  const canRegisterAttention = permissions.includes('CLINIC_ATTENTION_REGISTER') || canManageAppointments;
  const canManageTreatments = permissions.includes('CLINIC_TREATMENT_MANAGE');
  const canManageStudies = permissions.includes('CLINIC_STUDY_MANAGE');
  const canManageIncome = permissions.includes('CLINIC_INCOME_MANAGE');
  const tabHref = (nextTab: Tab) => {
    const params = new URLSearchParams();
    params.set('tab', nextTab);
    if (personId) params.set('personId', personId);
    if (attentionId) params.set('attentionId', attentionId);
    return `/clinic?${params}`;
  };

  let body: React.ReactNode;
  if (!patient && !personId && tab === 'Agenda') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Agenda</h2><AgendaDate value={agendaDate} onChange={setAgendaDate} />{list.isError ? <p role="alert">No se pudo cargar la agenda.</p> : list.isLoading ? <p>Cargando…</p> : list.data?.length ? <p>{list.data.length} turno(s)</p> : <p>No hay turnos para esta fecha.</p>}</section>;
  } else if (!patient && !personId && tab === 'Obra social') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Obras sociales y órdenes</h2><p>{list.data?.length || 0} obras sociales configuradas</p></section>;
  } else if (!patient) {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">{tab === 'Obra social' ? 'Obras sociales y órdenes' : tab}</h2><p role="alert" className="mt-3">{personId ? 'La Persona todavía no está registrada como Paciente.' : 'Seleccioná un Paciente desde Personas para trabajar en este contexto clínico.'}</p></section>;
  } else if (tab === 'Paciente') {
    const actions = [
      canManageAppointments ? ['Agendar turno', `/clinic/appointments/new?personId=${patient.id}`] : null,
      canRegisterAttention ? ['Registrar atención', `/clinic/attentions/new?personId=${patient.id}`] : null,
      canManageTreatments ? ['Nuevo tratamiento', `/clinic/treatments/new?personId=${patient.id}`] : null,
      canManageStudies ? ['Nuevo estudio', `/clinic/studies/new?personId=${patient.id}`] : null,
      canManageIncome ? ['Registrar cobro', `/finance/clinical-income/new?personId=${patient.id}`] : null,
    ].filter((action): action is [string, string] => action !== null);
    body = <section className="rounded border bg-white p-5"><h2 className="text-xl font-semibold">{patient.firstName} {patient.lastName}</h2><p>DNI {patient.dni} · Paciente registrado</p>{actions.length ? <div className="mt-4 flex flex-wrap gap-2">{actions.map(([label, href]) => <Link key={label} href={href} className="rounded border bg-[#FCCC05] px-3 py-2 text-sm text-black">{label}</Link>)}</div> : <p className="mt-4 text-sm text-muted-foreground">Tu rol permite consultar este contexto, sin acciones clínicas disponibles.</p>}</section>;
  } else if (tab === 'Agenda') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Turnos del Paciente</h2><AgendaDate value={agendaDate} onChange={setAgendaDate} /><List<Appointment> query={list as typeof list & { data: Appointment[] | undefined }} empty="No hay turnos registrados para esta fecha.">{(appointment) => <article className="rounded border p-3"><div className="font-medium">{displayDateTime(appointment.startAt)} · {statusLabel(appointment.status)}</div><div className="text-sm">{appointment.serviceType?.name || 'Servicio'} · {appointment.durationMinutes} min · {appointment.professional ? `${appointment.professional.firstName} ${appointment.professional.lastName}` : '—'}</div></article>}</List></section>;
  } else if (tab === 'Atenciones') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Atenciones</h2>{canRegisterAttention ? <Link href={`/clinic/attentions/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Registrar atención</Link> : null}</div><List query={attentions} empty="No hay atenciones registradas.">{(attention) => <article className="rounded border p-3"><div className="font-medium">{displayDateTime(attention.occurredAt)} · {attention.appointmentId ? 'Turno' : 'Atención directa'}</div><div className="text-sm">Profesional: {attention.professional ? `${attention.professional.firstName} ${attention.professional.lastName}` : '—'}</div><Link className="text-sm underline" href={`/clinic?tab=Evaluaciones&personId=${patient.id}&attentionId=${attention.id}`}>Abrir atención</Link></article>}</List></section>;
  } else if (tab === 'Evaluaciones') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Evaluaciones clínicas</h2>{attentionId ? <List query={evaluations} empty="No hay evaluaciones clínicas registradas.">{(evaluation) => <article className="rounded border p-3">{displayDateTime(evaluation.createdAt)} · Evaluación clínica · {evaluation.results?.length || 0} resultados</article>}</List> : <><p className="mt-3 text-sm">Seleccioná una Atención para ver sus evaluaciones.</p><List query={attentions} empty="No hay atenciones disponibles.">{(attention) => <Link className="block rounded border p-3" href={`/clinic?tab=Evaluaciones&personId=${patient.id}&attentionId=${attention.id}`}>{displayDateTime(attention.occurredAt)} · Abrir atención</Link>}</List></>}</section>;
  } else if (tab === 'Tratamientos') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Tratamientos</h2>{canManageTreatments ? <Link href={`/clinic/treatments/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Nuevo tratamiento</Link> : null}</div><List<Treatment> query={list as typeof list & { data: Treatment[] | undefined }} empty="No hay tratamientos registrados.">{(treatment) => <article className="rounded border p-3"><div className="font-medium">{treatment.bodyAreaOrInjury} · {statusLabel(treatment.status)}</div><div className="text-sm">{treatment.consultationReason} · Desde {treatment.startDate}{treatment.currentStage ? ` · Etapa: ${treatment.currentStage}` : ''}</div></article>}</List></section>;
  } else if (tab === 'Estudios') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Estudios</h2>{canManageStudies ? <Link href={`/clinic/studies/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Nuevo estudio</Link> : null}</div><List<Study> query={list as typeof list & { data: Study[] | undefined }} empty="No hay estudios registrados.">{(study) => <article className="rounded border p-3"><div className="font-medium">{study.studyDate} · {study.studyType}</div><div className="text-sm">{study.description || 'Sin descripción'} · {study.fileAsset ? 'Adjunto' : 'Sin archivo'}</div></article>}</List></section>;
  } else if (tab === 'Obra social') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Obra social actual</h2><p className="mt-2">Obra social del paciente</p><h3 className="mt-5 font-semibold">Órdenes</h3><List<Order> query={list as typeof list & { data: Order[] | undefined }} empty="No hay órdenes registradas.">{(order) => <article className="rounded border p-3"><div className="font-medium">{order.socialWork?.name || 'Obra social'} · {order.reference}</div><div className="text-sm">Emitida: {order.issueDate || '—'} · Vence: {order.expirationDate || '—'} {order.isExpired ? '· Vencida' : ''}</div></article>}</List></section>;
  } else {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Indicaciones</h2><List<Indication> query={list as typeof list & { data: Indication[] | undefined }} empty="No hay indicaciones registradas.">{(indication) => <article className="rounded border p-3"><div>{statusLabel(indication.status)} · {statusLabel(indication.trainingCondition)}</div><div className="text-sm">{indication.affectedArea || ''} {indication.instructions || ''}</div></article>}</List></section>;
  }

  return <WorkspaceShell active="Clínica"><main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6"><header><p className="text-sm text-muted-foreground">Workspace clínico</p><h1 className="text-2xl font-semibold">Clínica</h1>{patient ? <p>Paciente: <strong>{patient.firstName} {patient.lastName}</strong> · DNI {patient.dni}</p> : null}</header><nav aria-label="Secciones de Clínica" className="flex gap-1 overflow-x-auto border-b">{tabs.map((item) => <Link key={item} href={tabHref(item)} aria-current={tab === item ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === item ? 'border-[#FCCC05] font-medium text-foreground' : 'border-transparent text-muted-foreground'}`}>{item}</Link>)}</nav>{body}</main></WorkspaceShell>;
}

function AgendaDate({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <label className="mt-4 block text-sm">Fecha de agenda<input aria-label="Fecha de agenda" type="date" value={value} onChange={(event) => onChange(event.target.value)} className="ml-2 rounded border px-2" /></label>;
}

export default function ClinicPage(): React.JSX.Element {
  return <Suspense fallback={<p className="p-6">Cargando clínica…</p>}><ClinicWorkspace /></Suspense>;
}
