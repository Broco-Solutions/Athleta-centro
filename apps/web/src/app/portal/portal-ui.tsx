'use client';
import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, KeyRound, LogOut, Star } from 'lucide-react';
import { formatOperationalTime } from '../../lib/operational-time';

export class PortalApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PortalApiError';
  }
}

export const portalFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/portal/${path}`, { credentials: 'include', ...init });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error
      && typeof error.code === 'string' && typeof error.message === 'string') {
      throw new PortalApiError(error.code, error.message);
    }
    throw new Error('No pudimos cargar esta información.');
  }
  const body = await response.json() as { data: T };
  return body.data;
};

export const formatDate = (value: string): string => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' }).format(new Date(value));
};
export const formatDateTime = (value: string): string => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export { formatOperationalTime };
export const formatTime = formatOperationalTime;
export const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export async function portalLogout(): Promise<void> {
  const response = await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new Error('No pudimos cerrar la sesión. Intentá nuevamente.');
  window.location.href = '/portal/login';
}

export function PortalLogoutButton(): React.JSX.Element {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  return <span><button type="button" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm disabled:opacity-50" onClick={async () => {
    setPending(true); setError('');
    try { await portalLogout(); } catch { setError('No pudimos cerrar la sesión. Intentá nuevamente.'); setPending(false); }
  }}><LogOut size={16} aria-hidden="true" />{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>{error ? <span role="alert" className="block text-sm">{error}</span> : null}</span>;
}

export function PortalNav(): React.JSX.Element {
  const pathname = usePathname();
  return <nav aria-label="Navegación del Portal" className="flex gap-6">
    {[['/portal', 'Inicio'], ['/portal/profile', 'Mis datos']].map(([href, label]) => <Link key={href} href={href!} aria-current={pathname === href ? 'page' : undefined} className={'inline-flex min-h-12 items-center border-b-2 px-1 text-sm font-medium ' + (pathname === href ? 'border-primary' : 'border-transparent')}>{label}</Link>)}
  </nav>;
}

export function PortalFrame({ title, subtitle, action, backToHome = false, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; backToHome?: boolean; children: React.ReactNode;
}): React.JSX.Element {
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/portal" aria-label="Athleta · Inicio" className="shrink-0">
          <span aria-hidden="true" className="flex justify-center gap-1 text-primary">{[0, 1, 2].map(star => <Star key={star} size={12} fill="currentColor" />)}</span>
          <span className="block text-xl font-bold tracking-[0.22em]">ATHLETA</span>
          <span className="hidden text-[8px] tracking-wider lg:block">CENTRO DE REHABILITACIÓN Y ENTRENAMIENTO</span>
        </Link>
        <span className="text-xs text-sidebar-foreground/70 md:hidden">Portal personal</span>
        <div className="hidden flex-1 md:block"><PortalNav /></div>
        <div className="hidden items-center gap-3 md:flex"><Link href="/portal/change-pin" className="inline-flex min-h-11 items-center gap-2 text-sm"><KeyRound size={16} aria-hidden="true" />Cambiar PIN</Link><PortalLogoutButton /></div>
      </div>
    </header>
    <div className="border-b bg-surface px-4 md:hidden"><PortalNav /></div>
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      {backToHome ? <Link href="/portal" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} aria-hidden="true" />Volver a Inicio</Link> : null}
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div><p className="text-xs font-semibold tracking-widest text-muted-foreground">PORTAL ATHLETA</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>{subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}</div>
        {action ? <div className="w-full md:w-auto">{action}</div> : null}
      </header>
      {children}
    </main>
    <footer className="border-t"><div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8"><span>Athleta · Portal personal</span><span>Desarrollado por Broco Solutions</span></div></footer>
  </div>;
}

export function bookingError(error: unknown): string {
  if (!(error instanceof PortalApiError)) return 'No pudimos reservar ese horario. Intentá nuevamente.';
  if (error.code === 'PORTAL_SALA_PAYMENT_REQUIRED') return 'Para reservar esta fecha necesitás tener abonado el mes correspondiente.';
  if (error.code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' || error.code === 'SALA_CAPACITY_FULL') return 'No hay lugar disponible para ese horario.';
  if (error.code === 'SALA_RESERVATION_DUPLICATE' || error.code === 'SALA_BOOKING_OVERLAP' || error.code === 'SALA_OCCURRENCE_DUPLICATE') return 'Ya tenés una actividad reservada en ese horario. Elegí otro horario.';
  if (error.code === 'SALA_SCHEDULE_CLOSED') return 'El horario está cerrado para esa fecha.';
  if (error.code === 'SALA_SERVICE_TYPE_INVALID' || error.code === 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN') return 'El servicio no está disponible para tu Plan.';
  if (error.code === 'SALA_REQUIRED_SLOTS_UNAVAILABLE') return 'El servicio no entra completo en ese horario.';
  return error.message || 'No pudimos reservar ese horario. Intentá nuevamente.';
}
