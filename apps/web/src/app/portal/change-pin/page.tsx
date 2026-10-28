'use client';
import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { PortalSession } from '../portal-ui';
import { useRouter } from 'next/navigation';
import { PortalFooter } from '../portal-footer';
import { PinInput } from '../../../features/auth/pin-input';
import { PortalMessage } from '../portal-message';

export default function ChangePin(): React.JSX.Element {
  const router = useRouter();
  // Observe only the already verified Portal cache; this footer never fetches.
  const portalSession = useQuery<PortalSession>({ queryKey: ['portal', 'session'], queryFn: skipToken, enabled: false });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  return <main className="portal-access flex min-h-dvh flex-col">
    <section className="portal-access-brand"><header><Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-36"/><span>PORTAL</span></header><h1>Elegí tu PIN personal</h1></section>
    <section className="portal-access-body"><form className="portal-access-card space-y-5" aria-busy={pending} onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      submitting.current = true; setPending(true); setError('');
      try {
        const sessionResponse = await fetch('/api/portal/auth/session', { credentials: 'include' });
        if (!sessionResponse.ok) throw new Error('SESSION_FAILED');
        const session = await sessionResponse.json();
        const response = await fetch('/api/portal/auth/change-pin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.data.csrfToken }, credentials: 'include', body: JSON.stringify({ currentPin: current, nextPin: next }) });
        if (!response.ok) { setError('El PIN no es válido.'); return; }
        router.push('/portal');
      } catch { setError('El PIN no es válido.'); }
      finally { submitting.current = false; setPending(false); }
    }}>
      <div className="space-y-2"><label htmlFor="current-pin" className="block text-sm font-medium">PIN actual</label><PinInput id="current-pin" secretLabel="PIN actual" required autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value.replace(/\D/g, '').slice(0,4))}/></div>
      <div className="space-y-2"><label htmlFor="next-pin" className="block text-sm font-medium">Nuevo PIN</label><PinInput id="next-pin" secretLabel="nuevo PIN" required autoComplete="new-password" value={next} onChange={event => setNext(event.target.value.replace(/\D/g, '').slice(0,4))} aria-describedby="pin-help"/><p id="pin-help" className="text-sm text-muted-foreground">4 números.</p></div>
      {error && <PortalMessage>{error}</PortalMessage>}
      <button type="submit" className="portal-primary w-full disabled:opacity-60" disabled={pending}>{pending ? 'Guardando…' : 'Guardar PIN'}</button>
    </form></section>
    <PortalFooter firstName={portalSession.isSuccess && !portalSession.isFetching ? portalSession.data.person?.firstName : undefined} />
  </main>;
}
