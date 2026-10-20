'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Contact, Eye, EyeOff, Lock } from 'lucide-react';
import React from 'react';
import { useState } from 'react';

export default function PortalLogin(): React.JSX.Element {
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  return (
    <main className="flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-2">
      <section className="relative flex min-h-[10.5rem] flex-col overflow-hidden bg-sidebar px-5 pb-4 pt-4 text-sidebar-foreground sm:px-8 lg:min-h-dvh lg:justify-between lg:px-12 lg:py-12">
        <header>
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-32 sm:w-36 lg:w-40" />
        </header>

        <div className="relative mt-3 flex items-end justify-between gap-3 lg:my-auto lg:pt-20">
          <h2 className="relative z-10 text-[1.625rem] font-extrabold uppercase leading-[0.98] tracking-tight sm:text-4xl lg:text-5xl">
            <span className="block">DESBLOQUEÁ TU</span>
            <span className="mt-1 block -skew-x-6 text-primary">POTENCIAL.</span>
          </h2>
          <ArrowUpRight aria-hidden="true" className="mb-1 mr-1 h-14 w-14 shrink-0 text-primary sm:h-16 sm:w-16 lg:h-20 lg:w-20" strokeWidth={1.7} />
        </div>
        <span aria-hidden="true" className="absolute bottom-0 left-5 h-1 w-14 bg-primary sm:left-8 lg:left-12" />
      </section>

      <section className="flex flex-1 flex-col px-5 pb-3 pt-4 sm:px-8 lg:min-h-dvh lg:items-center lg:justify-center lg:px-12 lg:py-12">
        <form
          className="mx-auto flex w-full max-w-md flex-1 flex-col lg:flex-none"
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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Portal Athleta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá con tu DNI y PIN para continuar.</p>
          </div>

          <div className="mt-3 space-y-2.5">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-dni">DNI</label>
              <span className="relative block">
                <Contact aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="portal-dni" required autoComplete="username" aria-describedby="portal-dni-help" value={dni} onChange={(event) => setDni(event.target.value)} placeholder="Ingresá tu DNI" className="h-12 w-full rounded-md border border-border bg-white pl-11 pr-3 text-base font-normal outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-ring" />
              </span>
              <p id="portal-dni-help" className="text-xs font-normal text-muted-foreground">Sin puntos ni espacios.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="portal-pin">PIN de 4 dígitos</label>
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

          <div className="mt-3 text-center text-sm lg:mt-5">
            <p className="text-muted-foreground">¿Necesitás ayuda para ingresar?</p>
            <p className="mt-1 font-medium">Consultá en recepción.</p>
          </div>

          <footer className="mt-auto border-t border-border pt-3 text-center text-xs text-muted-foreground sm:mt-6 lg:mt-10">
            Desarrollado por <span className="font-semibold text-foreground">Broco Solutions</span>
          </footer>
        </form>
      </section>
    </main>
  );
}
