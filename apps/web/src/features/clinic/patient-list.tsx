'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
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

export function PatientList(): React.JSX.Element {
  const [treatmentInProgress, setTreatmentInProgress] = useState<TreatmentFilter>('');
  const [withoutRecentAttentionDays, setWithoutRecentAttentionDays] = useState<RecentAttentionFilter>('');
  const [page, setPage] = useState(1);
  const patients = useQuery({
    queryKey: ['clinic', 'patients', 'overview', treatmentInProgress, withoutRecentAttentionDays, page],
    queryFn: async () => {
      const response = await listClinicalPatientsOverview({
        page,
        pageSize: 10,
        ...(treatmentInProgress ? { treatmentInProgress } : {}),
        ...(withoutRecentAttentionDays ? { withoutRecentAttentionDays } : {}),
      }, { credentials: 'include' });
      if (response.status !== 200) throw new Error('No pudimos cargar los Pacientes.');
      return response.data;
    },
    placeholderData: (previous) => previous,
  });
  const changeTreatmentFilter = (value: TreatmentFilter) => {
    setTreatmentInProgress(value);
    setPage(1);
  };
  const changeRecentAttentionFilter = (value: RecentAttentionFilter) => {
    setWithoutRecentAttentionDays(value);
    setPage(1);
  };

  return <section className="rounded border bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm text-muted-foreground">Clínica</p><h2 className="m-0 text-xl font-semibold">Pacientes</h2></div><div className="flex flex-wrap gap-3"><label className="text-sm">Tratamiento En curso<select aria-label="Tratamiento En curso" className="ml-2 h-10 rounded-md border bg-white px-3" value={treatmentInProgress} onChange={(event) => changeTreatmentFilter(event.target.value as TreatmentFilter)}><option value="">Todos</option><option value="YES">Sí</option><option value="NO">No</option></select></label><label className="text-sm">Sin Atención reciente<select aria-label="Sin Atención reciente" className="ml-2 h-10 rounded-md border bg-white px-3" value={withoutRecentAttentionDays} onChange={(event) => changeRecentAttentionFilter(event.target.value ? Number(event.target.value) as RecentAttentionFilter : '')}><option value="">Todos</option><option value="30">30 días o más</option><option value="60">60 días o más</option><option value="90">90 días o más</option></select></label></div></div>{patients.isError ? <p role="alert" className="mt-4 text-sm text-red-700">No pudimos cargar el listado de Pacientes.</p> : <><div className="mt-5 overflow-x-auto rounded-md border"><table className="w-full border-collapse text-left text-sm"><thead className="bg-surface-muted"><tr><th className="p-3">Paciente</th><th className="p-3">DNI</th><th className="p-3">Estado</th><th className="p-3">Última atención</th><th className="p-3">Acciones</th></tr></thead><tbody>{patients.data?.data.map((patient) => <tr key={patient.id} className="border-t"><td className="p-3 font-medium">{patient.lastName}, {patient.firstName}</td><td className="p-3">{patient.dni}</td><td className="p-3">{patient.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</td><td className="p-3">{formatAttentionDate(patient.lastAttentionAt ?? null)}</td><td className="p-3"><Link className="text-sm font-medium underline" href={`/clinic?tab=Paciente&personId=${patient.id}`}>Abrir ficha</Link></td></tr>)}</tbody></table></div>{patients.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Cargando…</p> : !patients.data?.data.length ? <p className="mt-4 text-sm text-muted-foreground">No encontramos Pacientes con estos filtros.</p> : null}<div className="mt-4 flex items-center justify-between text-sm"><span>{patients.data?.meta.total ?? 0} Pacientes</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={page >= (patients.data?.meta.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)}>Siguiente</Button></div></div></>}</section>;
}
