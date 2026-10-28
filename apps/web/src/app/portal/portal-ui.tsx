'use client';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PortalFooter } from './portal-footer';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, KeyRound, LogOut } from 'lucide-react';
import { formatOperationalTime } from '../../lib/operational-time';

export type PortalSession = { person?: { firstName?: string } | undefined; mustChangePin?: boolean; csrfToken?: string; healthDeclaration?: { required: boolean } };

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
}

export function PortalLogoutButton({ compactOnMobile = false }: { compactOnMobile?: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const submitting = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  return <span className="relative inline-flex min-w-0 flex-col"><button type="button" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm disabled:opacity-50" onClick={async () => {
    if (submitting.current) return; submitting.current = true; setPending(true); setError('');
    // Discard the verified identity immediately, including while logout is pending.
    if (queryClient.getQueryState(['portal', 'session'])?.status === 'success') {
      queryClient.setQueryData<PortalSession>(['portal', 'session'], current => current ? { ...current, person: undefined } : current);
    }
    try { await portalLogout(); await queryClient.cancelQueries(); queryClient.clear(); window.location.replace('/portal/login'); } catch { setError('No pudimos cerrar la sesión. Intentá nuevamente.'); setPending(false); submitting.current = false; }
  }} aria-label={pending ? 'Cerrando sesión…' : 'Cerrar sesión'}><LogOut size={16} aria-hidden="true" /><span className={compactOnMobile ? 'md:hidden' : 'hidden'}>{pending ? 'Saliendo…' : 'Salir'}</span><span className={compactOnMobile ? 'hidden md:inline' : undefined}>{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</span></button>{error ? <span role="alert" className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-red-200! bg-red-50 p-3 text-sm text-red-800 shadow-sm">{error}</span> : null}</span>;
}

export function PortalNav(): React.JSX.Element {
  const pathname = usePathname();
  const profileActive = pathname === '/portal/profile';
  const healthActive = pathname === '/portal/declaracion-salud';
  return <nav aria-label="Navegación del Portal" className="portal-nav flex gap-4 overflow-x-auto">
    {[['/portal', 'Inicio'], ['/portal/profile', 'Mis datos'], ['/portal/declaracion-salud', 'Declaración de salud']].map(([href, label]) => {
      const active = href === '/portal/profile' ? profileActive : href === '/portal/declaracion-salud' ? healthActive : !profileActive && !healthActive;
      return <Link key={href} href={href!} aria-current={active ? 'page' : undefined} className={'inline-flex min-h-12 shrink-0 items-center border-b-2 px-1 text-sm font-medium ' + (active ? 'border-primary!' : 'border-transparent!')}>{label}</Link>;
    })}
  </nav>;
}

export function PortalFrame({ title, subtitle, action, backToHome = false, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; backToHome?: boolean; children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const session = useQuery({ queryKey: ['portal', 'session'], queryFn: () => portalFetch<PortalSession>('auth/session'), staleTime: Infinity, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false });
  React.useEffect(() => {
    if (session.error instanceof PortalApiError && session.error.code === 'UNAUTHENTICATED') window.location.assign('/portal/login');
    if (session.isFetching) return;
    if (session.data?.mustChangePin && pathname !== '/portal/change-pin') window.location.assign('/portal/change-pin');
    else if (session.data?.healthDeclaration?.required && !['/portal/declaracion-salud', '/portal/change-pin', '/portal/profile'].includes(pathname)) window.location.assign('/portal/declaracion-salud');
  }, [session.error, session.data, session.isFetching, pathname]);
  const gated = session.data?.mustChangePin || (session.data?.healthDeclaration?.required && !['/portal/declaracion-salud', '/portal/change-pin', '/portal/profile'].includes(pathname));
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link href="/portal" aria-label="Athleta · Inicio" className="shrink-0">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-36 sm:w-44" />
        </Link>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3"><Link href="/portal/change-pin" aria-label="Cambiar PIN" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm sm:gap-2 sm:px-3"><KeyRound size={16} aria-hidden="true" /><span className="md:hidden">PIN</span><span className="hidden md:inline">Cambiar PIN</span></Link><PortalLogoutButton compactOnMobile /></div>
      </div>
      <div className="mx-auto max-w-6xl"><PortalNav /></div>
    </header>
    <main data-portal-health={pathname === '/portal/declaracion-salud' || undefined} className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      {backToHome ? <Link href="/portal" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} aria-hidden="true" />Volver a Inicio</Link> : null}
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div><p className="portal-heading-label text-xs font-semibold tracking-widest">PORTAL ATHLETA</p><h1 tabIndex={-1} className="portal-heading-title mt-2 text-[28px] font-semibold">{title}</h1>{subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}</div>
        {action ? <div className="w-full md:w-auto">{action}</div> : null}
      </header>
      {gated ? <p role="status">Completá los requisitos de ingreso para continuar.</p> : children}
    </main>
    <PortalFooter surface="dark" firstName={session.isSuccess && !session.isFetching ? session.data.person?.firstName : undefined} />
  </div>;
}

export type ReplacementWeek = { weekStart: string; weekEnd: string; available: number };
export function replacementDateAllowed(date: string, weeks: ReplacementWeek[]): boolean {
  return weeks.some(week => week.available > 0 && date >= week.weekStart && date <= week.weekEnd);
}
export function firstReplacementDate(weeks: ReplacementWeek[], currentDate: string, maxDate: string): string | null {
  for (const week of [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart))) {
    const date = week.weekStart > currentDate ? week.weekStart : currentDate;
    if (week.available > 0 && date <= week.weekEnd && date <= maxDate) return date;
  }
  return null;
}

export function bookingError(error: unknown): string {
  if (!(error instanceof PortalApiError)) return 'No pudimos completar la operación. Tus datos no fueron modificados. Intentá nuevamente.';
  if (error.code === 'PORTAL_SALA_REPLACEMENT_REQUIRED') return 'Para reservar otro horario primero cancelá una fecha de uno de tus turnos fijos de esta semana.';
  if (error.code === 'SALA_WEEKLY_LIMIT_EXCEEDED') return 'Alcanzaste el límite de sesiones de tu plan para esta semana. Cancelá una reserva futura si necesitás cambiar de horario.';
  if (error.code === 'PORTAL_SALA_TIME_PASSED') return 'Ese horario ya no admite nuevas reservas. Elegí otro horario.';
  if (error.code === 'PORTAL_SALA_VALIDITY_REQUIRED' || error.code === 'PORTAL_SALA_PAYMENT_REQUIRED') return 'Tu cuota no está vigente para esta fecha. Consultá en recepción para renovarla.';
  if (error.code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' || error.code === 'SALA_CAPACITY_FULL') return 'Ese horario acaba de quedarse sin lugar. Elegí otro horario disponible.';
  if (error.code === 'SALA_RESERVATION_DUPLICATE' || error.code === 'SALA_BOOKING_OVERLAP' || error.code === 'SALA_OCCURRENCE_DUPLICATE') return 'Ya tenés una actividad reservada en ese horario. Elegí otro.';
  if (error.code === 'SALA_SCHEDULE_CLOSED') return 'Athleta cerró ese horario para esta fecha. Elegí otro horario.';
  if (error.code === 'SALA_SERVICE_TYPE_INVALID' || error.code === 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN') return 'Ese servicio no está disponible con tu Plan actual. Elegí otro servicio o consultá en recepción.';
  if (error.code === 'SALA_REQUIRED_SLOTS_UNAVAILABLE') return 'Ese horario ya no permite completar la duración del servicio. Elegí otro horario.';
  return 'No pudimos completar la operación. Tus datos no fueron modificados. Intentá nuevamente.';
}
