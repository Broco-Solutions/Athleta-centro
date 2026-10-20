'use client';
import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, KeyRound, LogOut } from 'lucide-react';
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

export function PortalLogoutButton({ compactOnMobile = false }: { compactOnMobile?: boolean }): React.JSX.Element {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  return <span><button type="button" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm disabled:opacity-50" onClick={async () => {
    setPending(true); setError('');
    try { await portalLogout(); } catch { setError('No pudimos cerrar la sesión. Intentá nuevamente.'); setPending(false); }
  }} aria-label={pending ? 'Cerrando sesión…' : 'Cerrar sesión'}><LogOut size={16} aria-hidden="true" /><span className={compactOnMobile ? 'md:hidden' : undefined}>{pending ? 'Saliendo…' : 'Salir'}</span><span className={compactOnMobile ? 'hidden md:inline' : undefined}>{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</span></button>{error ? <span role="alert" className="block text-sm">{error}</span> : null}</span>;
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link href="/portal" aria-label="Athleta · Inicio" className="shrink-0">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-36 sm:w-44" />
        </Link>
        <div className="hidden flex-1 md:block"><PortalNav /></div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3"><Link href="/portal/change-pin" aria-label="Cambiar PIN" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm sm:gap-2 sm:px-3"><KeyRound size={16} aria-hidden="true" /><span className="md:hidden">PIN</span><span className="hidden md:inline">Cambiar PIN</span></Link><PortalLogoutButton compactOnMobile /></div>
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
  if (!(error instanceof PortalApiError)) return 'No pudimos completar la operación. Tus datos no fueron modificados. Intentá nuevamente.';
  if (error.code === 'PORTAL_SALA_TIME_PASSED') return 'Ese horario ya no admite nuevas reservas. Elegí otro horario.';
  if (error.code === 'PORTAL_SALA_VALIDITY_REQUIRED' || error.code === 'PORTAL_SALA_PAYMENT_REQUIRED') return 'Tu cuota no está vigente para esta fecha. Consultá en recepción para renovarla.';
  if (error.code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' || error.code === 'SALA_CAPACITY_FULL') return 'Ese horario acaba de quedarse sin lugar. Elegí otro horario disponible.';
  if (error.code === 'SALA_RESERVATION_DUPLICATE' || error.code === 'SALA_BOOKING_OVERLAP' || error.code === 'SALA_OCCURRENCE_DUPLICATE') return 'Ya tenés una actividad reservada en ese horario. Elegí otro.';
  if (error.code === 'SALA_SCHEDULE_CLOSED') return 'Athleta cerró ese horario para esta fecha. Elegí otro horario.';
  if (error.code === 'SALA_SERVICE_TYPE_INVALID' || error.code === 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN') return 'Ese servicio no está disponible con tu Plan actual. Elegí otro servicio o consultá en recepción.';
  if (error.code === 'SALA_REQUIRED_SLOTS_UNAVAILABLE') return 'Ese horario ya no permite completar la duración del servicio. Elegí otro horario.';
  return 'No pudimos completar la operación. Tus datos no fueron modificados. Intentá nuevamente.';
}
