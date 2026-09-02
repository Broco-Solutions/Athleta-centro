'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listPeople } from '@athleta/api-client';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { AgendaPanel } from '../../features/sala/agenda-panel';
import { SalaNavigation } from '../../features/sala/sala-navigation';
type Person = { id: string; firstName: string; lastName: string; dni: string; status?: string; hasSalaParticipation?: boolean; contexts?: string[] };
const unwrap = <T,>(value: unknown): T[] => { const body = (value as { data?: unknown }).data; if (Array.isArray(body)) return body as T[]; const nested = (body as { data?: unknown } | undefined)?.data; return Array.isArray(nested) ? nested as T[] : []; };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
function SalaPageContent(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const [date, setDate] = useState(today); const [search, setSearch] = useState(''); const view = useSearchParams()?.get('view') === 'students' ? 'students' : 'agenda';
  const people = useQuery({ queryKey: ['people', 'sala-students'], queryFn: async () => unwrap<Person>(await listPeople({ page: 1, pageSize: 100 }, { credentials: 'include' })), initialData: [] }); const students = people.data.filter((person) => person.hasSalaParticipation || person.contexts?.includes('SALA')); const filtered = students.filter((person) => `${person.firstName} ${person.lastName} ${person.dni}`.toLowerCase().includes(search.toLowerCase()));
  return <WorkspaceShell active="Sala"><div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Módulo global</p><h1 className="text-3xl font-semibold">Sala</h1><p className="mt-1 text-sm text-muted-foreground">Operación diaria y personas con participación activa.</p></div><Link href="/people" className="text-sm font-medium underline">Ver Personas</Link></header><SalaNavigation active={view}/>{view === 'students' ? <section className="rounded-md border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Alumnos</h2><p className="text-sm text-muted-foreground">Personas con participación relevante en Sala.</p></div><div className="flex items-center gap-2 rounded-md border px-3"><Search size={17} className="text-muted-foreground"/><input aria-label="Buscar alumnos" className="h-10 outline-none" placeholder="Nombre o DNI" value={search} onChange={(event) => setSearch(event.target.value)}/></div></div><div className="mt-5 divide-y rounded-md border">{people.isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando alumnos…</p> : filtered.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No encontramos alumnos de Sala.</p> : filtered.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{person.lastName}, {person.firstName}</p><p className="text-sm text-muted-foreground">DNI {person.dni} · {person.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</p></div><Link href={`/sala/people/${person.id}`} className="rounded-md bg-[#FCCC05] px-3 py-2 text-sm font-medium text-black">Abrir</Link></div>)}</div></section> : <AgendaPanel date={date} onDateChange={setDate} csrfToken={session.data?.csrfToken ?? ''} people={people.data}/>}</div></WorkspaceShell>;
}

export default function SalaPage(): React.JSX.Element { return <Suspense fallback={<main className="p-6">Cargando Sala…</main>}><SalaPageContent /></Suspense>; }
