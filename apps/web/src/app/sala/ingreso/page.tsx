'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { ArrowRight, CheckCircle2, CircleAlert, CircleCheck, ScanLine, Search, ShieldAlert } from 'lucide-react';
import styles from './reception.module.css';
import { Button } from '@athleta/ui';
import { checkInSalaByDni, type CheckInByDniDto, type CheckInResultDto } from '@athleta/api-client';
import { WorkspaceShell } from '../../../features/auth/workspace-shell';
import { currentSession } from '../../../features/auth/auth';

export default function CheckInPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dni, setDni] = useState('');
  const [result, setResult] = useState<CheckInResultDto | null>(null);
  const [technicalError, setTechnicalError] = useState(false);
  const canCheckIn = session.data?.permissions.includes('SALA_AGENDA_MANAGE') ?? false;
  const checkIn = useMutation({
    mutationFn: async (payload: CheckInByDniDto) => {
      const response = await checkInSalaByDni(payload, { credentials: 'include', headers: { 'x-csrf-token': session.data?.csrfToken ?? '' } });
      if (response.status < 200 || response.status >= 300) throw new Error('CHECK_IN_FAILED');
      return response.data.data as CheckInResultDto;
    },
    onSuccess: async (value) => {
      setResult(value);
      if (value.status === 'NOT_FOUND') return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sala', 'agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['sala', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['reservations'] }),
      ]);
    },
    onSettled: () => { submitting.current = false; },
    retry: false,
    onError: () => { setTechnicalError(true); setResult({ status: 'ERROR', message: 'No pudimos verificar tu asistencia. Intentá nuevamente.' }); },
  });
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!/^\d{7,8}$/.test(dni) || submitting.current || (result && !['NOT_FOUND', 'ERROR'].includes(result.status))) return; submitting.current = true; setResult(null); setTechnicalError(false); checkIn.mutate({ dni }); };
  const reset = useCallback(() => { setDni(''); setResult(null); setTechnicalError(false); checkIn.reset(); requestAnimationFrame(() => inputRef.current?.focus()); }, [checkIn.reset]);

  useEffect(() => {
    if (!result || result.status === 'ERROR') return;
    const timeout = window.setTimeout(result.status === 'NOT_FOUND' ? () => { setResult(null); checkIn.reset(); } : reset, result.status === 'NOT_FOUND' ? 3_000 : 10_000);
    return () => window.clearTimeout(timeout);
  }, [result, reset, checkIn.reset]);

  // Keep the session boundary mounted while the shared query settles, including
  // a rejected session. Otherwise remounting it starts another read before it
  // can send the browser to login.
  if (session.isPending) return <WorkspaceShell active="sala-check-in"><p role="status">Cargando…</p></WorkspaceShell>;
  const completed = result && !['NOT_FOUND', 'ERROR'].includes(result.status);
  const ResultIcon = result?.status === 'REGISTERED' ? CheckCircle2 : result?.status === 'ALREADY_REGISTERED' ? CircleCheck : CircleAlert;
  const resultTitle = result?.status === 'REGISTERED' ? 'Ingreso registrado' : result?.status === 'ALREADY_REGISTERED' ? 'Ingreso ya registrado' : 'Revisá tu ingreso';
  return <WorkspaceShell active="sala-check-in"><div className={styles.reception}>
    <svg className={styles.track} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" strokeWidth="1"><path d="M-200 760 450 110h500l400 400"/><path d="M-200 810 470 140h460l400 400"/><path d="M-200 860 490 170h420l400 400"/><path d="M-200 910 510 200h380l400 400"/></g></svg>
    <div className={styles.welcome}>
      <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className={styles.logo} />
      <div className={styles.greeting}><h1>Bienvenido a Athleta</h1><p>Ingresá tu DNI para registrar tu llegada.</p></div>
    </div>
    <section className={styles.panel} aria-labelledby="check-in-title">
      <div className={styles.panelTitle}><ScanLine size={22} aria-hidden="true"/><h2 id="check-in-title">Ingreso</h2></div>
      {!canCheckIn ? <p role="alert" className="mt-8 text-lg">No tenés permiso para registrar asistencias.</p> : completed ? <div className={styles.result} role="status">
        <ResultIcon size={36} aria-hidden="true" className={result.status === 'REGISTERED' || result.status === 'ALREADY_REGISTERED' ? 'text-emerald-800' : 'text-amber-900'} />
        <h3>{resultTitle}</h3>
        <p>{result.message}</p>
        {result.person && result.startTime && <p className="font-semibold">{result.person} · Turno de las {result.startTime}</p>}
        {result.renewalMessage && <p className="text-amber-800">{result.renewalMessage}</p>}
        <Button className={styles.action} onClick={reset}>Registrar otro alumno<ArrowRight size={20} aria-hidden="true"/></Button>
      </div> : <form className={styles.form} onSubmit={submit} aria-busy={checkIn.isPending}>
        <label htmlFor="student-dni">DNI del alumno</label>
        <input ref={inputRef} id="student-dni" autoComplete="off" inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} required value={dni} disabled={checkIn.isPending} onChange={(event) => { setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); if (result) { setResult(null); setTechnicalError(false); } }} aria-describedby="check-in-feedback" aria-invalid={result?.status === 'NOT_FOUND' || technicalError || undefined} className={styles.dni} />
        <div id="check-in-feedback" className={styles.feedback}>
          {checkIn.isPending ? <p role="status"><Search size={20} aria-hidden="true"/>Verificando DNI…</p> : result?.status === 'NOT_FOUND' ? <p role="status" className="text-amber-900"><CircleAlert size={20} aria-hidden="true"/><span><strong>DNI no encontrado.</strong> {result.message}</span></p> : technicalError ? <p role="alert" className="text-red-800"><ShieldAlert size={20} aria-hidden="true"/><span><strong>Error técnico.</strong> No pudimos verificar tu asistencia. Intentá nuevamente.</span></p> : <p className="text-zinc-600">Esperando DNI · 7 u 8 números, sin puntos.</p>}
        </div>
        <Button type="submit" disabled={!/^\d{7,8}$/.test(dni) || checkIn.isPending} className={styles.action}>{checkIn.isPending ? 'Verificando…' : 'Registrar ingreso'}<ArrowRight size={20} aria-hidden="true"/></Button>
      </form>}
    </section>
  </div></WorkspaceShell>;
}
