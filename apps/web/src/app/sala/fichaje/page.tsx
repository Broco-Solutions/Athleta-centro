'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  if (session.isPending) return <main className="p-6" role="status">Cargando…</main>;
  return <WorkspaceShell active="sala-check-in"><main className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center p-4 sm:p-8">
    <section className="w-full rounded-xl border bg-white p-5 text-center sm:p-8" aria-labelledby="check-in-title">
      <h1 id="check-in-title" className="text-3xl font-semibold tracking-tight">Registrá tu ingreso</h1>
      {!canCheckIn ? <p role="alert" className="mt-8 text-lg">No tenés permiso para registrar asistencias.</p> : result && !['NOT_FOUND', 'ERROR'].includes(result.status) ? <div className="mt-8" aria-live="polite">
        <p className={`text-2xl font-semibold sm:text-3xl ${result.status === 'REGISTERED' || result.status === 'ALREADY_REGISTERED' ? 'text-emerald-800' : 'text-amber-900'}`}>{result.message}</p>
        {result.person && result.startTime && <p className="mt-4 text-xl">{result.person} · Turno de las {result.startTime}</p>}
        {result.renewalMessage && <p className="mt-3 text-base text-amber-800">{result.renewalMessage}</p>}
        <Button className="mt-8 min-h-14 w-full text-lg" onClick={reset}>Registrar otro alumno</Button>
      </div> : <form className="mt-8 space-y-5" onSubmit={submit}>
        <label htmlFor="student-dni" className="block text-base font-medium">Ingresá el DNI</label>
        <input ref={inputRef} id="student-dni" aria-label="DNI del alumno" autoComplete="off" inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} required value={dni} onChange={(event) => { setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); if (result) { setResult(null); setTechnicalError(false); } }} placeholder="Ingresá el DNI" className="h-16 w-full rounded-xl border-2 px-5 text-center text-3xl tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {result?.status === 'NOT_FOUND' ? <p role="status" className="text-base text-amber-900">{result.message}</p> : null}
        {technicalError ? <p role="alert" className="text-lg text-red-700">No pudimos verificar tu asistencia. Intentá nuevamente.</p> : null}
        <Button type="submit" disabled={!/^\d{7,8}$/.test(dni) || checkIn.isPending} className="min-h-14 w-full text-lg font-semibold">{checkIn.isPending ? 'Verificando…' : 'Registrar ingreso'}</Button>
      </form>}
    </section>
  </main></WorkspaceShell>;
}
