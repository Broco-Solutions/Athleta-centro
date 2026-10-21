'use client';

import Image from 'next/image';
import { DeveloperFooter } from '../../../features/branding/developer-footer';
import { useRouter } from 'next/navigation';
import { ArrowRight, Contact, Eye, EyeOff, Lock } from 'lucide-react';
import React from 'react';
import { useState } from 'react';

export default function PortalLogin(): React.JSX.Element {
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <section className="bg-sidebar px-5 py-5 text-sidebar-foreground sm:px-8">
        <header className="flex items-center gap-3">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-32 sm:w-36 lg:w-40" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/70">PORTAL</span>
        </header>
        <p className="mt-5 text-xl font-bold uppercase text-white sm:text-2xl">
          <span className="block">DESBLOQUEÁ TU</span>
          <span className="block text-primary">POTENCIAL.</span>
        </p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:px-8">
        <form
          className="mx-auto flex w-full max-w-md flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
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
          }}
        >
          <h1 className="mb-6 text-2xl font-semibold">Iniciar sesión</h1>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-dni">DNI</label>
              <span className="relative block">
                <Contact aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="portal-dni" required autoComplete="username" aria-describedby="portal-dni-help" value={dni} onChange={(event) => setDni(event.target.value)} placeholder="Ingresá tu DNI" className="h-12 w-full rounded-md border border-border bg-white pl-11 pr-3 text-base font-normal outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-ring" />
              </span>
              <p id="portal-dni-help" className="text-xs font-normal text-muted-foreground">Sin puntos ni espacios.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-pin">PIN</label>
              <span className="relative block">
                <Lock aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="portal-pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" type={showPin ? 'text' : 'password'} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Ingresá tu PIN" className="h-12 w-full rounded-md border border-border bg-white pl-11 pr-12 text-base font-normal outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-ring" />
                <button type="button" aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'} onClick={() => setShowPin((visible) => !visible)} className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {showPin ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                </button>
              </span>
            </div>
          </div>

          {error ? <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p> : null}

          <button type="submit" className="mt-3 inline-flex h-12 w-full items-center justify-between rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Ingresar
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>

          <p className="mt-3 text-center text-sm lg:mt-5">
            <span className="text-muted-foreground">¿Necesitás ayuda? </span>
            <span className="font-medium">Consultá en recepción.</span>
          </p>

        </form>
      </section>
      <footer className="border-t border-border px-5 py-5 text-center"><DeveloperFooter /></footer>
    </main>
  );
}
