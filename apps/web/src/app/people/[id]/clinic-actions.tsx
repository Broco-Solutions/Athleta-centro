'use client';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { currentSession } from '../../../features/auth/auth';

export function ClinicActions({ personId }: { personId: string }): React.JSX.Element {
  const session=useQuery({queryKey:['auth','session'],queryFn:currentSession,retry:false}); const [patient,setPatient]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{fetch('/api/clinic/patients',{credentials:'include'}).then(r=>r.json()).then((v:{data?:{data?:Array<{id:string}>}|Array<{id:string}>})=>{const rows=Array.isArray(v.data)?v.data:v.data?.data??[];setPatient(rows.some(row=>row.id===personId));}).finally(()=>setLoading(false));},[personId]);
  const register=async()=>{setError('');const response=await fetch('/api/clinic/patients',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':session.data?.csrfToken??''},body:JSON.stringify({personId})});if(!response.ok){setError('No pudimos dar de alta a la Persona como Paciente.');return;}setPatient(true)};
  if(loading)return <p className="mt-4 text-sm text-muted-foreground">Verificando contexto clínico…</p>;
  if(!patient)return <div className="mt-4"><p className="mb-3 text-sm text-muted-foreground">Esta Persona todavía no es Paciente de Clínica.</p><Button onClick={register}>Dar de alta en Clínica</Button>{error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div>;
  return <div className="mt-4 flex flex-wrap gap-2"><span className="w-full text-sm font-medium text-emerald-700">Paciente de Clínica</span><Link className="rounded-md bg-[#FCCC05] px-3 py-2 text-sm font-medium text-black" href={`/clinic?personId=${personId}`}>Abrir ficha clínica</Link><Link className="rounded-md border px-3 py-2 text-sm" href={`/clinic/appointments/new?personId=${personId}`}>Agendar turno</Link><Link className="rounded-md border px-3 py-2 text-sm" href={`/clinic/attentions/new?personId=${personId}`}>Registrar atención</Link></div>;
}

export function SalaContext({ personId }: { personId: string }): React.JSX.Element {
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => { fetch(`/api/sala/participations/person/${personId}`, { credentials: 'include' }).then((r) => r.json()).then((v: { data?: { data?: Array<{ endDate?: string | null }> } | Array<{ endDate?: string | null }> }) => { const rows = Array.isArray(v.data) ? v.data : v.data?.data ?? []; setActive(rows.some((row) => !row.endDate)); }).catch(() => setActive(false)); }, [personId]);
  return <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">Sala<br />{active === null ? 'Verificando participación…' : active ? <span className="font-medium text-emerald-700">✓ Participación activa</span> : <span className="text-muted-foreground">Sin participación activa</span>}</div>;
}
