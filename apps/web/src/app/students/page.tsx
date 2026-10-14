'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bulkChangeSalaProfessor, bulkLeaveSala, listSalaProfessors, listSalaStudents } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';

import { ParticipationDialog } from '../../features/sala/participation-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  const [mine, setMine] = useState(false);
  const [threshold, setThreshold] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'professor' | 'leave' | null>(null);
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const canManage = session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false;
  const isProfessor = session.data?.roles.includes('PROFESSOR') ?? false;
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
    (filter !== 'pending-payment' || student.paymentStatus === 'PENDING') &&
    (!mine || student.professor.id === session.data?.user.id) && student.unpaidConsecutiveMonths >= threshold);
  const visibleIds = filtered.map((student) => student.participationId);
  const visibleKey = visibleIds.join(',');
  useEffect(() => { setSelected((previous) => previous.filter((id) => visibleKey.split(',').includes(id))); }, [visibleKey]);
  const selection = selected.filter((id) => visibleIds.includes(id));
  const toggle = (id: string) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const saved = async () => { await client.invalidateQueries({ queryKey: ['sala', 'students'] }); setSelected([]); setDialog(null); };
  return <WorkspaceShell active="sala-students"><div className="mx-auto max-w-7xl space-y-5 text-foreground">
    <header><h1 className="text-3xl font-semibold">Alumnos</h1><p className="mt-1 text-sm text-muted-foreground">{students.length} {students.length === 1 ? 'alumno' : 'alumnos'}</p></header>
    <div className="space-y-3">
      <div className="relative w-full max-w-sm"><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar por nombre o DNI" placeholder="Buscar por nombre o DNI" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <div role="group" aria-label="Filtrar alumnos" className="flex flex-wrap gap-2">{filters.map((item) => <Button key={item.value} variant={filter === item.value ? 'primary' : 'secondary'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}{isProfessor ? <Button variant={mine ? 'primary' : 'secondary'} aria-pressed={mine} onClick={() => setMine(!mine)}>Mis alumnos</Button> : null}</div>
      <label className="grid max-w-sm gap-1 text-sm">Meses consecutivos sin pago<select className="h-11 rounded-md border border-border bg-surface px-3" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>{[0, 1, 2, 3, 6].map((value) => <option key={value} value={value}>{value ? `${value} o más` : 'Todos'}</option>)}</select></label>
      {canManage && filtered.length ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selection.length === filtered.length} onChange={(event) => setSelected(event.target.checked ? visibleIds : [])}/>Seleccionar todos los alumnos filtrados</label> : null}
      {canManage && selection.length ? <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3"><p>{selection.length} alumnos seleccionados</p><Button variant="secondary" onClick={() => setDialog('professor')}>Cambiar profesor principal</Button><Button variant="secondary" onClick={() => setDialog('leave')}>Dar de baja de Sala</Button></div> : null}
    </div>
    {session.isPending || (canRead && query.isPending) ? <p role="status" className="text-sm text-muted-foreground">Cargando alumnos…</p> : session.isSuccess && !canRead ? <p role="alert">No tenés permisos para consultar Alumnos.</p> : query.isError || session.isError ? <p role="alert">No se pudieron cargar los alumnos.</p> : filtered.length === 0 ? <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center"><p className="font-medium">{students.length ? 'Sin resultados' : 'No hay alumnos activos de Sala.'}</p>{students.length ? <p className="mt-1 text-sm text-muted-foreground">No hay alumnos que coincidan con la búsqueda y los filtros.</p> : null}</div> :
    <table aria-label="Alumnos activos de Sala" className="block w-full xl:table xl:table-fixed xl:overflow-hidden xl:rounded-md xl:border xl:border-border xl:bg-surface">
      <thead className="hidden bg-surface-muted text-left text-xs font-semibold text-muted-foreground xl:table-header-group"><tr>{[...(canManage ? ['Selección'] : []), 'Alumno', 'DNI', 'Plan', 'Profesor', 'Rutina', 'Pago', 'Acción'].map((title) => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}</tr></thead>
      <tbody className="grid gap-3 sm:grid-cols-2 xl:table-row-group">{filtered.map((student) => <tr key={student.id} className="grid min-w-0 rounded-md border border-border bg-surface py-3 xl:table-row xl:border-0 xl:border-t xl:py-0">
        {canManage ? <td className={cell}><input type="checkbox" aria-label={`Seleccionar a ${student.firstName} ${student.lastName}`} checked={selection.includes(student.participationId)} onChange={() => toggle(student.participationId)}/></td> : null}
        <td className={`${cell} break-words font-medium`}>{student.firstName} {student.lastName}</td>
        <td className={cell}><span className={label}>DNI</span>{student.dni}</td>
        <td className={`${cell} break-words`}><span className={label}>Plan:</span>{student.plan.name}</td>
        <td className={`${cell} break-words`}><span className={label}>Profesor:</span>{student.professor.firstName} {student.professor.lastName}</td>
        <td className={cell}><span className={label}>Rutina:</span><span className={badge(student.routineStatus === 'ACTIVE')}>{student.routineStatus === 'ACTIVE' ? 'Activa' : 'Sin rutina'}</span></td>
        <td className={cell}><span className={label}>Pago:</span><span className={badge(student.paymentStatus === 'PAID')}>{student.paymentStatus === 'PAID' ? 'Al día' : 'Pendiente'}</span></td>
        <td className={`${cell} text-right xl:text-left`}><Link href={`/sala/people/${student.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-9">Ver ficha</Link></td>
      </tr>)}</tbody>
    </table>}
    {dialog && canManage && selection.length ? <BulkParticipationDialog kind={dialog} ids={selection} csrf={session.data?.csrfToken ?? ''} onClose={() => setDialog(null)} onSaved={saved}/> : null}
  </div></WorkspaceShell>;
}

export default function StudentsPage(): React.JSX.Element {
  return <Suspense fallback={<p role="status" className="p-6">Cargando alumnos…</p>}><StudentsContent /></Suspense>;
}

const professorSchema = z.object({ mainProfessorId: z.string().min(1, 'Seleccioná un profesor.') });
function BulkParticipationDialog({ kind, ids, csrf, onClose, onSaved }: { kind: 'professor' | 'leave'; ids: string[]; csrf: string; onClose: () => void; onSaved: () => Promise<void> }): React.JSX.Element {
  const title = kind === 'professor' ? 'Cambiar profesor principal' : 'Dar de baja de Sala';
  const form = useForm<z.infer<typeof professorSchema>>({ resolver: zodResolver(professorSchema), defaultValues: { mainProfessorId: '' } });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: kind === 'professor', queryFn: async () => {
    const response = await listSalaProfessors({ credentials: 'include' });
    if (response.status >= 400) throw new Error('No se pudieron cargar los profesores.');
    return response.data.data;
  } });
  const mutation = useMutation({ mutationFn: async (mainProfessorId?: string) => {
    const options = { credentials: 'include', headers: { 'x-csrf-token': csrf } } satisfies RequestInit;
    const response = kind === 'professor' ? await bulkChangeSalaProfessor({ participationIds: ids, mainProfessorId: mainProfessorId ?? '' }, options) : await bulkLeaveSala({ participationIds: ids }, options);
    if (response.status !== 200) throw new Error('No se pudo completar la operación. Revisá la selección e intentá nuevamente.');
  }, onSuccess: onSaved });
  return <ParticipationDialog title={title} onClose={onClose} busy={mutation.isPending}>
    {kind === 'professor' ? <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values.mainProfessorId))}>
      <p>{ids.length} alumnos seleccionados</p><label className="grid gap-1 text-sm">Nuevo profesor<select className="h-11 rounded-md border px-3" {...form.register('mainProfessorId')}><option value="">Seleccionar profesor</option>{professors.data?.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
      {professors.isError ? <p role="alert">No se pudieron cargar los profesores.</p> : null}{mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!form.watch('mainProfessorId') || mutation.isPending}>Cambiar profesor</Button></div>
    </form> : <><p>Se dará de baja de Sala a {ids.length} alumnos.</p><p className="text-sm">Se finalizarán sus relaciones actuales de Sala según las reglas vigentes. La Persona y su información histórica se conservan.</p>{mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>Dar de baja</Button></div></>}
  </ParticipationDialog>;
}
