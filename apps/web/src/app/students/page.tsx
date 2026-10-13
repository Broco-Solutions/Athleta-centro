'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listSalaStudents } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';

type Filter = 'all' | 'without-routine' | 'pending-payment';
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'without-routine', label: 'Sin rutina' },
  { value: 'pending-payment', label: 'Pago pendiente' },
];
const badge = (positive: boolean) => `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`;
const cell = 'block min-w-0 px-4 py-1 text-sm xl:table-cell xl:py-3';
const label = 'mr-1 text-muted-foreground xl:hidden';

function StudentsContent(): React.JSX.Element {
  const params = useSearchParams();
  const requested = params.get('filter');
  const initialFilter: Filter = requested === 'without-routine' || requested === 'pending-payment' ? requested : 'all';
  // A changed URL resets the local selection, including client-side dashboard navigation.
  return <StudentList key={initialFilter} initialFilter={initialFilter} />;
}

function StudentList({ initialFilter }: { initialFilter: Filter }): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState('');
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const canRead = ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ'].every((permission) => session.data?.permissions.includes(permission));
  const query = useQuery({ queryKey: ['sala', 'students'], enabled: canRead, queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los alumnos.');
    return response.data.data;
  } });
  const students = query.data ?? [];
  const term = search.trim().toLocaleLowerCase('es');
  const filtered = students.filter((student) =>
    (`${student.firstName} ${student.lastName}`.toLocaleLowerCase('es').includes(term) || student.dni.includes(term)) &&
    (filter !== 'without-routine' || student.routineStatus === 'MISSING') &&
    (filter !== 'pending-payment' || student.paymentStatus === 'PENDING'));
  return <WorkspaceShell active="Alumnos"><div className="mx-auto max-w-7xl space-y-5 text-foreground">
    <header><h1 className="text-3xl font-semibold">Alumnos</h1><p className="mt-1 text-sm text-muted-foreground">{students.length} {students.length === 1 ? 'alumno' : 'alumnos'}</p></header>
    <div className="space-y-3">
      <div className="relative w-full max-w-sm"><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar por nombre o DNI" placeholder="Buscar por nombre o DNI" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <div role="group" aria-label="Filtrar alumnos" className="flex flex-wrap gap-2">{filters.map((item) => <Button key={item.value} variant={filter === item.value ? 'primary' : 'secondary'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
    </div>
    {session.isPending || (canRead && query.isPending) ? <p role="status" className="text-sm text-muted-foreground">Cargando alumnos…</p> : session.isSuccess && !canRead ? <p role="alert">No tenés permisos para consultar Alumnos.</p> : query.isError || session.isError ? <p role="alert">No se pudieron cargar los alumnos.</p> : filtered.length === 0 ? <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center"><p className="font-medium">{students.length ? 'Sin resultados' : 'No hay alumnos activos de Sala.'}</p>{students.length ? <p className="mt-1 text-sm text-muted-foreground">No hay alumnos que coincidan con la búsqueda y los filtros.</p> : null}</div> :
    <table aria-label="Alumnos activos de Sala" className="block w-full xl:table xl:table-fixed xl:overflow-hidden xl:rounded-md xl:border xl:border-border xl:bg-surface">
      <thead className="hidden bg-surface-muted text-left text-xs font-semibold text-muted-foreground xl:table-header-group"><tr>{['Alumno', 'DNI', 'Plan', 'Profesor', 'Rutina', 'Pago', 'Acción'].map((title) => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}</tr></thead>
      <tbody className="grid gap-3 sm:grid-cols-2 xl:table-row-group">{filtered.map((student) => <tr key={student.id} className="grid min-w-0 rounded-md border border-border bg-surface py-3 xl:table-row xl:border-0 xl:border-t xl:py-0">
        <td className={`${cell} break-words font-medium`}>{student.firstName} {student.lastName}</td>
        <td className={cell}><span className={label}>DNI</span>{student.dni}</td>
        <td className={`${cell} break-words`}><span className={label}>Plan:</span>{student.plan.name}</td>
        <td className={`${cell} break-words`}><span className={label}>Profesor:</span>{student.professor.firstName} {student.professor.lastName}</td>
        <td className={cell}><span className={label}>Rutina:</span><span className={badge(student.routineStatus === 'ACTIVE')}>{student.routineStatus === 'ACTIVE' ? 'Activa' : 'Sin rutina'}</span></td>
        <td className={cell}><span className={label}>Pago:</span><span className={badge(student.paymentStatus === 'PAID')}>{student.paymentStatus === 'PAID' ? 'Al día' : 'Pendiente'}</span></td>
        <td className={`${cell} text-right xl:text-left`}><Link href={`/sala/people/${student.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-9">Ver ficha</Link></td>
      </tr>)}</tbody>
    </table>}
  </div></WorkspaceShell>;
}

export default function StudentsPage(): React.JSX.Element {
  return <Suspense fallback={<p role="status" className="p-6">Cargando alumnos…</p>}><StudentsContent /></Suspense>;
}
