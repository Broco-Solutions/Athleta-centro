'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSocialWork, retireSocialWork, listSocialWorks } from '@athleta/api-client';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { fetchPerson } from '../../features/people/people-api';
import { PatientProfile } from '../../features/clinic/patient-profile';
import { PatientList } from '../../features/clinic/patient-list';
import { ClinicalAgenda } from '../../features/clinic/clinical-agenda';
import { ClinicalAttentionPanel } from '../../features/clinic/clinical-attention-panel';
import { fetchClinicalAttentions } from '../../features/clinic/clinic-api';

type Treatment = { id: string; status: string; bodyAreaOrInjury: string; consultationReason: string; startDate: string; currentStage?: string | null };
type Study = { id: string; studyDate: string; studyType: string; description?: string | null; fileAsset?: unknown | null };
type Order = { id: string; reference: string; issueDate?: string | null; expirationDate?: string | null; isExpired?: boolean; socialWork?: { name: string } };
type Indication = { id: string; status: string; trainingCondition: string; affectedArea?: string | null; instructions?: string | null };
type Evaluation = { id: string; createdAt: string; results?: unknown[] };
type SocialWork = { id: string; name: string; isSelectable: boolean };
type Row = { id: string };

const tabs = ['Agenda', 'Pacientes', 'Paciente', 'Tratamientos', 'Atenciones', 'Evaluaciones', 'Estudios', 'Obra social', 'Indicaciones'] as const;
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

function List<T extends Row>({ query, empty, children }: { query: { isLoading: boolean; isError: boolean; data: T[] | undefined }; empty: string; children: (item: T) => React.ReactNode }): React.JSX.Element {
  if (query.isLoading) return <p className="mt-4">Cargando…</p>;
  if (query.isError) return <p role="alert" className="mt-4">No pudimos cargar esta sección. <button type="button" className="underline" onClick={() => window.location.reload()}>Reintentar</button></p>;
  if (!query.data?.length) return <p className="mt-4 text-sm text-muted-foreground">{empty}</p>;
  return <div className="mt-4 space-y-2">{query.data.map((item) => <React.Fragment key={item.id}>{children(item)}</React.Fragment>)}</div>;
}

function SocialWorkCatalog({ canManage, csrfToken }: { canManage: boolean; csrfToken: string }): React.JSX.Element {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const catalog = useQuery({ queryKey: ['social-works'], queryFn: async () => { const result = await listSocialWorks({ credentials: 'include' }); if (result.status !== 200) throw new Error('No pudimos cargar las obras sociales.'); return (result.data as unknown as { data: SocialWork[] }).data; } });
  const action = useMutation({ mutationFn: async (id?: string) => {
    const options = { credentials: 'include', headers: { 'x-csrf-token': csrfToken } } satisfies RequestInit;
    const result = id ? await retireSocialWork(id, options) : await createSocialWork({ name: name.trim() }, options);
    if (result.status >= 400) throw new Error('No pudimos guardar los cambios.');
  }, onSuccess: async (_result, id) => { if (!id) setName(''); await client.invalidateQueries({ queryKey: ['social-works'] }); } });
  return <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Obras sociales</h2>
    {canManage && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); action.mutate(undefined); }}><label className="text-sm">Nueva obra social<input aria-label="Nombre de obra social" className="block h-10 rounded-md border px-3" value={name} onChange={(event) => setName(event.target.value)} /></label><Button type="submit" disabled={!name.trim() || action.isPending}>Guardar</Button></form>}
    {action.isError && <p role="alert" className="mt-3 text-sm text-red-700">No pudimos guardar los cambios.</p>}
    <List query={catalog} empty="No hay obras sociales configuradas.">{(work) => <article className="flex items-center justify-between rounded border p-3"><div>{work.name} · {work.isSelectable ? 'Disponible' : 'Retirada'}</div>{canManage && work.isSelectable && <Button variant="secondary" disabled={action.isPending} onClick={() => { if (window.confirm(`¿Retirar ${work.name}? Se conservará en los registros existentes.`)) action.mutate(work.id); }}>Retirar</Button>}</article>}</List>
  </section>;
}

function ClinicWorkspace(): React.JSX.Element {
  const search = useSearchParams();
  const personId = search?.get('personId') || '';
  const attentionId = search?.get('attentionId') || '';
  const tab: Tab = isTab(search?.get('tab') ?? null) ? search.get('tab') as Tab : personId ? 'Paciente' : 'Agenda';
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const identity = useQuery({ queryKey: ['person', personId], queryFn: () => fetchPerson(personId), enabled: Boolean(personId) && permissions.includes('PEOPLE_READ'), retry: false });
  const patient = identity.data?.isClinicalPatient ? identity.data : undefined;
  const historyTab = ['Tratamientos', 'Estudios', 'Evaluaciones', 'Indicaciones'].includes(tab);
  const canOpenTab = !historyTab || permissions.includes('CLINICAL_HISTORY_READ');
  const listPath = tab === 'Tratamientos' ? `clinic/treatments?personId=${personId}` : tab === 'Atenciones' ? `clinic/attentions?personId=${personId}` : tab === 'Estudios' ? `clinic/studies?personId=${personId}` : tab === 'Obra social' ? personId ? `clinic/orders?personId=${personId}` : '' : tab === 'Indicaciones' ? `clinic/indications?personId=${personId}` : '';
  const list = useQuery({ queryKey: ['clinic', tab, personId], queryFn: () => get<Row[]>(listPath), enabled: Boolean(listPath) && Boolean(patient) && canOpenTab });
  const attentions = useQuery({ queryKey: ['clinic', 'attentions', personId], queryFn: () => fetchClinicalAttentions(personId), enabled: Boolean(patient) && (tab === 'Atenciones' || tab === 'Evaluaciones') && permissions.includes('CLINIC_OPERATIONAL_READ') });
  const evaluations = useQuery({ queryKey: ['clinic', 'evaluations', attentionId], queryFn: () => get<Evaluation[]>(`clinic/attentions/${attentionId}/evaluations`), enabled: tab === 'Evaluaciones' && Boolean(attentionId) && permissions.includes('CLINICAL_HISTORY_READ') });
  const coverage = identity;
  const catalog = useQuery({ queryKey: ['social-works'], queryFn: () => get<SocialWork[]>('clinic/social-works'), enabled: tab === 'Obra social' && Boolean(patient) });
  const socialWork = catalog.data?.find((work) => work.id === coverage.data?.socialWorkId);
  const canManageCatalog = permissions.includes('SOCIAL_WORK_CATALOG_MANAGE');
  const canManageAppointments = permissions.includes('CLINIC_APPOINTMENT_MANAGE');
  const canRegisterAttention = permissions.includes('CLINIC_ATTENTION_REGISTER') || canManageAppointments;
  const canManageTreatments = permissions.includes('CLINIC_TREATMENT_MANAGE');
  const canManageStudies = permissions.includes('CLINIC_STUDY_MANAGE');
  const canManageIncome = permissions.includes('CLINIC_INCOME_MANAGE');
  const canReadClinicalHistory = permissions.includes('CLINICAL_HISTORY_READ');
  const visibleTabs: readonly Tab[] = patient ? (canReadClinicalHistory ? tabs.filter((item) => item !== 'Pacientes') : ['Agenda', 'Paciente', 'Atenciones', 'Obra social']) : ['Agenda', 'Pacientes', ...(tab === 'Obra social' ? ['Obra social' as const] : [])];
  const tabHref = (nextTab: Tab) => {
    const params = new URLSearchParams(search?.toString());
    params.set('tab', nextTab);
    if (personId && nextTab !== 'Pacientes') params.set('personId', personId);
    else params.delete('personId');
    if (attentionId) params.set('attentionId', attentionId);
    return `/clinic?${params}`;
  };

  let body: React.ReactNode;
  if (session.isPending) {
    body = <p role="status">Cargando clínica…</p>;
  } else if (!patient && !personId && tab === 'Pacientes') {
    body = <PatientList initialParams={search?.toString() ?? ''}/>;
  } else if (!patient && !personId && tab === 'Agenda') {
    body = <ClinicalAgenda csrfToken={session.data?.csrfToken ?? ''} canManage={canManageAppointments} />;
  } else if (!patient && !personId && tab === 'Obra social') {
    body = <SocialWorkCatalog canManage={canManageCatalog} csrfToken={session.data?.csrfToken ?? ''} />;
  } else if (personId && !permissions.includes('PEOPLE_READ')) {
    body = <p role="alert">No tenés permisos para consultar los datos de esta Persona.</p>;
  } else if (personId && identity.isPending) {
    body = <p role="status">Cargando Persona…</p>;
  } else if (personId && identity.isError) {
    body = <section className="rounded-md border bg-surface p-5"><p role="alert">{(identity.error as { status?: number }).status === 404 ? 'La Persona no existe.' : 'No pudimos cargar la Persona.'}</p><Button type="button" variant="secondary" onClick={() => void identity.refetch()}>Reintentar</Button></section>;
  } else if (!patient) {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">{tab}</h2><p role="alert" className="mt-3">{personId ? 'La Persona todavía no está registrada como Paciente.' : 'Seleccioná un Paciente desde Pacientes para trabajar en este contexto clínico.'}</p></section>;
  } else if (!canOpenTab) {
    body = <p role="alert">No tenés permisos para consultar esta sección clínica.</p>;
  } else if (tab === 'Paciente') {
    const actions = [
      canManageAppointments ? ['Agendar turno', `/clinic/appointments/new?personId=${patient.id}`] : null,
      canRegisterAttention ? ['Registrar atención', `/clinic/attentions/new?personId=${patient.id}`] : null,
      canManageTreatments ? ['Nuevo tratamiento', `/clinic/treatments/new?personId=${patient.id}`] : null,
      canManageStudies ? ['Nuevo estudio', `/clinic/studies/new?personId=${patient.id}`] : null,
      canManageIncome ? ['Registrar cobro', `/finance/clinical-income/new?personId=${patient.id}`] : null,
    ].filter((action): action is [string, string] => action !== null);
    body = <PatientProfile person={patient} permissions={permissions} csrfToken={session.data?.csrfToken ?? ''} tabHref={tabHref}>{actions.length ? <div className="mt-4 flex flex-wrap gap-2">{actions.map(([label, href]) => <Link key={label} href={href} className="rounded border bg-[#FCCC05] px-3 py-2 text-sm text-black">{label}</Link>)}</div> : <p className="mt-4 text-sm text-muted-foreground">Tu rol permite consultar este contexto, sin acciones clínicas disponibles.</p>}</PatientProfile>;
  } else if (tab === 'Agenda') {
    body = <ClinicalAgenda personId={patient.id} csrfToken={session.data?.csrfToken ?? ''} canManage={canManageAppointments} />;
  } else if (tab === 'Atenciones') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Atenciones</h2>{canRegisterAttention ? <Link href={`/clinic/attentions/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Registrar atención</Link> : null}</div><List query={attentions} empty="No hay atenciones registradas.">{(attention) => <ClinicalAttentionPanel attention={attention} csrfToken={session.data?.csrfToken ?? ''} canClinical={canReadClinicalHistory} />}</List></section>;
  } else if (tab === 'Evaluaciones') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Evaluaciones clínicas</h2>{attentionId ? <List query={evaluations} empty="No hay evaluaciones clínicas registradas.">{(evaluation) => <article className="rounded border p-3">{displayDateTime(evaluation.createdAt)} · Evaluación clínica · {evaluation.results?.length || 0} resultados</article>}</List> : <><p className="mt-3 text-sm">Seleccioná una Atención para ver sus evaluaciones.</p><List query={attentions} empty="No hay atenciones disponibles.">{(attention) => <Link className="block rounded border p-3" href={`/clinic?tab=Evaluaciones&personId=${patient.id}&attentionId=${attention.id}`}>{displayDateTime(attention.occurredAt)} · Abrir atención</Link>}</List></>}</section>;
  } else if (tab === 'Tratamientos') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Tratamientos</h2>{canManageTreatments ? <Link href={`/clinic/treatments/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Nuevo tratamiento</Link> : null}</div><List<Treatment> query={list as typeof list & { data: Treatment[] | undefined }} empty="No hay tratamientos registrados.">{(treatment) => <article className="rounded border p-3"><div className="font-medium">{treatment.bodyAreaOrInjury} · {statusLabel(treatment.status)}</div><div className="text-sm">{treatment.consultationReason} · Desde {treatment.startDate}{treatment.currentStage ? ` · Etapa: ${treatment.currentStage}` : ''}</div></article>}</List></section>;
  } else if (tab === 'Estudios') {
    body = <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">Estudios</h2>{canManageStudies ? <Link href={`/clinic/studies/new?personId=${patient.id}`} className="rounded bg-[#FCCC05] px-3 py-2 text-sm">Nuevo estudio</Link> : null}</div><List<Study> query={list as typeof list & { data: Study[] | undefined }} empty="No hay estudios registrados.">{(study) => <article className="rounded border p-3"><div className="font-medium">{study.studyDate} · {study.studyType}</div><div className="text-sm">{study.description || 'Sin descripción'} · {study.fileAsset ? 'Adjunto' : 'Sin archivo'}</div></article>}</List></section>;
  } else if (tab === 'Obra social') {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Obra social actual</h2>{coverage.isError || catalog.isError ? <p role="alert">No pudimos cargar la cobertura actual.</p> : coverage.isLoading || (coverage.data?.socialWorkId && catalog.isLoading) ? <p>Cargando cobertura…</p> : coverage.data?.socialWorkId ? <div className="mt-2"><p>Nombre: {socialWork?.name ?? 'No pudimos resolver el nombre.'}</p><p>Número de afiliado: {coverage.data.affiliateNumber || '—'}</p></div> : <p className="mt-2">Sin obra social</p>}<h3 className="mt-5 font-semibold">Órdenes</h3><List<Order> query={list as typeof list & { data: Order[] | undefined }} empty="No hay órdenes registradas.">{(order) => <article className="rounded border p-3"><div className="font-medium">{order.socialWork?.name || 'Obra social'} · {order.reference}</div><div className="text-sm">Emitida: {order.issueDate || '—'} · Vence: {order.expirationDate || '—'} {order.isExpired ? '· Vencida' : ''}</div></article>}</List></section>;
  } else {
    body = <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Indicaciones</h2><List<Indication> query={list as typeof list & { data: Indication[] | undefined }} empty="No hay indicaciones registradas.">{(indication) => <article className="rounded border p-3"><div>{statusLabel(indication.status)} · {statusLabel(indication.trainingCondition)}</div><div className="text-sm">{indication.affectedArea || ''} {indication.instructions || ''}</div></article>}</List></section>;
  }

  return <WorkspaceShell active={tab === 'Agenda' ? 'clinic-appointments' : 'clinic-patients'}><main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6"><header><p className="text-sm text-muted-foreground">Workspace clínico</p><h1 className="text-2xl font-semibold">Clínica</h1>{patient ? <p>Paciente: <strong>{patient.firstName} {patient.lastName}</strong> · DNI {patient.dni}</p> : null}</header>{personId && <Link className="inline-block text-sm font-medium underline" href={tabHref('Pacientes')}>Volver a Pacientes</Link>}<nav aria-label="Secciones de Clínica" className="flex gap-1 overflow-x-auto border-b">{visibleTabs.map((item) => <Link key={item} href={tabHref(item)} aria-current={tab === item ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === item ? 'border-[#FCCC05] font-medium text-foreground' : 'border-transparent text-muted-foreground'}`}>{item}</Link>)}</nav>{body}</main></WorkspaceShell>;
}

export default function ClinicPage(): React.JSX.Element {
  return <Suspense fallback={<p className="p-6">Cargando clínica…</p>}><ClinicWorkspace /></Suspense>;
}
