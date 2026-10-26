'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { currentSession } from '../auth/auth';
import { PatientOnboarding } from './patient-onboarding';
import { listClinicalPatientsOverview } from '@athleta/api-client';

type TreatmentFilter = '' | 'YES' | 'NO';
type RecentAttentionFilter = '' | 30 | 60 | 90;

function formatAttentionDate(value: string | null): string {
  if (!value) return 'Sin atenciones';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function PatientList({ initialParams = '' }: { initialParams?: string }): React.JSX.Element {
  const initial = new URLSearchParams(initialParams);
  const [treatmentInProgress, setTreatmentInProgress] = useState<TreatmentFilter>(initial.get('treatmentInProgress') === 'YES' ? 'YES' : initial.get('treatmentInProgress') === 'NO' ? 'NO' : '');
  const [withoutRecentAttentionDays, setWithoutRecentAttentionDays] = useState<RecentAttentionFilter>([30, 60, 90].includes(Number(initial.get('withoutRecentAttentionDays'))) ? Number(initial.get('withoutRecentAttentionDays')) as RecentAttentionFilter : '');
  const [search, setSearch] = useState(initial.get('search') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(initial.get('page')) || 1));
  const [creating, setCreating] = useState(false);
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const canRegister = permissions.includes('CLINIC_APPOINTMENT_MANAGE') && permissions.includes('PEOPLE_READ');
  const listParams = new URLSearchParams({ tab: 'Pacientes', search, page: String(page), treatmentInProgress, withoutRecentAttentionDays: String(withoutRecentAttentionDays) });
  const preserveFilters = (changes: Record<string, string>) => {
    const params = new URLSearchParams(listParams);
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    window.history.replaceState(null, '', `/clinic?${params}`);
  };
  const patients = useQuery({
    queryKey: ['clinic', 'patients', 'overview', search, treatmentInProgress, withoutRecentAttentionDays, page],
    queryFn: async () => {
      const response = await listClinicalPatientsOverview({
        page,
        pageSize: 25,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(treatmentInProgress ? { treatmentInProgress } : {}),
        ...(withoutRecentAttentionDays ? { withoutRecentAttentionDays } : {}),
      }, { credentials: 'include' });
      if (response.status !== 200) throw new Error('No pudimos cargar los Pacientes.');
      return response.data;
    },
    placeholderData: (previous) => previous,
  });
  const changeTreatmentFilter = (value: TreatmentFilter) => {
    preserveFilters({ treatmentInProgress: value, page: '1' });
    setTreatmentInProgress(value);
    setPage(1);
  };
  const changeRecentAttentionFilter = (value: RecentAttentionFilter) => {
    preserveFilters({ withoutRecentAttentionDays: String(value), page: '1' });
    setWithoutRecentAttentionDays(value);
    setPage(1);
  };

  return <section className="rounded border bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm text-muted-foreground">Clínica</p><h2 className="m-0 text-xl font-semibold">Pacientes</h2></div><div className="flex flex-wrap gap-3">{canRegister && <Button type="button" onClick={() => setCreating(true)}>Nuevo paciente</Button>}<label className="text-sm">Tratamiento En curso<select aria-label="Tratamiento En curso" className="ml-2 h-10 rounded-md border bg-white px-3" value={treatmentInProgress} onChange={(event) => changeTreatmentFilter(event.target.value as TreatmentFilter)}><option value="">Todos</option><option value="YES">Sí</option><option value="NO">No</option></select></label><label className="text-sm">Sin Atención reciente<select aria-label="Sin Atención reciente" className="ml-2 h-10 rounded-md border bg-white px-3" value={withoutRecentAttentionDays} onChange={(event) => changeRecentAttentionFilter(event.target.value ? Number(event.target.value) as RecentAttentionFilter : '')}><option value="">Todos</option><option value="30">30 días o más</option><option value="60">60 días o más</option><option value="90">90 días o más</option></select></label></div></div><label className="mt-4 block text-sm">Buscar Pacientes<input aria-label="Buscar Pacientes" placeholder="Nombre, apellido o DNI" className="mt-1 block h-10 w-full max-w-lg rounded-md border px-3" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); preserveFilters({ search: event.target.value, page: '1' }); }}/></label>{patients.isPlaceholderData || patients.isPending ? <p className="mt-3 mb-4 text-sm text-muted-foreground">Cargando resultados…</p> : patients.isSuccess ? <p className="mt-3 mb-4 text-sm text-muted-foreground">{patients.data.meta.total} {patients.data.meta.total === 1 ? 'paciente' : 'pacientes'}</p> : null}{creating && canRegister && <PatientOnboarding csrfToken={session.data?.csrfToken ?? ''} canCreate={permissions.includes('PEOPLE_CREATE')} onClose={() => setCreating(false)}/>}{patients.isError ? <p role="alert" className="mt-4 text-sm text-red-700">No pudimos cargar el listado de Pacientes.</p> : <><div className="mt-5 overflow-x-auto rounded-md border"><table className="w-full border-collapse text-left text-sm"><thead className="bg-surface-muted"><tr><th className="p-3">Paciente</th><th className="p-3">DNI</th><th className="p-3">Estado</th><th className="p-3">Sala / Deporte / Club</th><th className="p-3">Última atención</th><th className="p-3">Próximo turno</th><th className="p-3">Acciones</th></tr></thead><tbody>{patients.data?.data.map((patient) => <tr key={patient.id} className="border-t"><td className="p-3 font-medium">{patient.lastName}, {patient.firstName}</td><td className="p-3">{patient.dni}</td><td className="p-3">{patient.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</td><td className="p-3">{patient.hasSalaParticipation && <p>Participación actual en Sala</p>}{patient.sport && <p>{patient.sport}</p>}{patient.club && <p>{patient.club}</p>}</td><td className="p-3">{formatAttentionDate(patient.lastAttentionAt ?? null)}</td><td className="p-3">{patient.nextAppointmentAt ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(patient.nextAppointmentAt)) : 'Sin próximo turno'}</td><td className="p-3"><Link className="text-sm font-medium underline" href={`/clinic?${new URLSearchParams({ ...Object.fromEntries(listParams), tab: 'Paciente', personId: patient.id })}`}>Abrir ficha</Link></td></tr>)}</tbody></table></div>{patients.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Cargando…</p> : !patients.data?.data.length ? <p className="mt-4 text-sm text-muted-foreground">No encontramos Pacientes con estos filtros.</p> : null}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" disabled={page === 1} onClick={() => { preserveFilters({ page: String(page - 1) }); setPage(page - 1); }}>Anterior</Button><span>Página {page} de {Math.max(1, patients.data?.meta.totalPages ?? 1)}</span><Button type="button" variant="secondary" disabled={page >= (patients.data?.meta.totalPages ?? 1)} onClick={() => { preserveFilters({ page: String(page + 1) }); setPage(page + 1); }}>Siguiente</Button></div></div></>}</section>;
}
