'use client';

import Image from 'next/image';
import { PortalFooter } from '../portal-footer';
import { useRouter } from 'next/navigation';
import { ArrowRight, Contact } from 'lucide-react';
import React from 'react';
import { PinInput } from '../../../features/auth/pin-input';
import { useState } from 'react';
import { PortalMessage } from '../portal-message';

export default function PortalLogin(): React.JSX.Element {
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = React.useRef(false);

  return (
    <main className="portal-access flex min-h-dvh flex-col">
      <section className="portal-access-brand">
        <header className="flex items-center gap-3">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-32 sm:w-36 lg:w-40" />
          <span aria-label="Portal personal">PORTAL</span>
        </header>
        <h1>DESBLOQUEÁ TU<br/><span>POTENCIAL.</span></h1>
      </section>

      <section className="portal-access-body">
        <form
          className="portal-access-card mx-auto flex w-full max-w-md flex-col" aria-busy={pending}
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting.current) return;
            submitting.current = true; setPending(true); setError('');
            try {
            const response = await fetch('/api/portal/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ dni, pin }),
              credentials: 'include',
            });
            if (!response.ok) {
              setError('No pudimos ingresar con esos datos. Revisalos o comunicate con Athleta.');
              return;
            }
            const body = await response.json();
            router.push(body.data.mustChangePin ? '/portal/change-pin' : '/portal');
            } catch { setError('No pudimos ingresar con esos datos. Revisalos o comunicate con Athleta.'); }
            finally { submitting.current = false; setPending(false); }
          }}
        >
          <h2 className="mb-6 text-2xl font-semibold">Iniciar sesión</h2>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-dni">DNI</label>
              <span className="relative block">
                <Contact aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="portal-dni" required inputMode="numeric" pattern="[0-9]*" autoComplete="username" aria-describedby="portal-dni-help" value={dni} onChange={(event) => setDni(event.target.value.replace(/\D/g, ''))} placeholder="Ingresá tu DNI" className="h-12 w-full rounded-md border border-border bg-white pl-11 pr-3 text-base font-normal outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-ring" />
              </span>
              <p id="portal-dni-help" className="text-xs font-normal text-muted-foreground">Sin puntos ni espacios.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-pin">PIN</label>
              <PinInput id="portal-pin" secretLabel="PIN" required autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ingresá tu PIN" />
            </div>
          </div>

          {error ? <div className="mt-4"><PortalMessage>{error}</PortalMessage></div> : null}

          <button type="submit" disabled={pending} className="mt-3 inline-flex h-12 w-full items-center justify-between rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors disabled:cursor-wait disabled:opacity-60 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {pending ? 'Ingresando…' : 'Ingresar'}
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>

          <p className="mt-3 text-center text-sm lg:mt-5">
            <span className="text-muted-foreground">¿Necesitás ayuda? </span>
            <span className="font-medium">Consultá en recepción.</span>
          </p>
        </form>
      </section>
      <PortalFooter />
    </main>
  );
}
