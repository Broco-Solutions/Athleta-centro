'use client';
import { useQuery } from '@tanstack/react-query';
import { listClinicalAppointments } from '@athleta/api-client';
import { useState } from 'react';

export default function ClinicPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const query = useQuery({ queryKey: ['clinic-appointments', date], queryFn: () => listClinicalAppointments({}) });
  const appointments = (query.data?.data ?? []) as Array<{ id:string; startAt:string; durationMinutes:number; status:string; person?:{firstName:string;lastName:string}; professional?:{firstName:string;lastName:string} }>;
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><header><p className="text-sm text-muted-foreground">Clínica</p><h1 className="text-2xl font-semibold">Agenda clínica</h1></header><label className="flex max-w-xs flex-col gap-1 text-sm">Fecha<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded border p-2" /></label>{query.isLoading && <p>Cargando agenda…</p>}{query.isError && <p role="alert">No se pudo cargar la agenda.</p>}{!query.isLoading && appointments.length===0 && <p className="rounded border p-6 text-muted-foreground">No hay turnos para esta fecha.</p>}<section className="space-y-2">{appointments.filter(a=>a.startAt.slice(0,10)===date).map(a=><article key={a.id} className="flex items-center justify-between rounded border p-4"><div><p className="font-medium">{new Date(a.startAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})} · {a.person ? `${a.person.firstName} ${a.person.lastName}` : 'Paciente'}</p><p className="text-sm text-muted-foreground">Profesional: {a.professional ? `${a.professional.firstName} ${a.professional.lastName}` : '—'} · {a.durationMinutes} min</p></div><span className="rounded px-2 py-1 text-xs">{a.status}</span></article>)}</section></main>;
}
