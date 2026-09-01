'use client';
import type React from 'react';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

export const portalFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/portal/${path}`, { credentials: 'include', ...init });
  if (!response.ok) throw new Error('No pudimos cargar esta información.');
  const body = await response.json() as { data: T };
  return body.data;
};

export const formatDate = (value: string): string => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' }).format(new Date(value));
};
export const formatDateTime = (value: string): string => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export function PortalNav(): React.JSX.Element {
  const sala = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<{ reservations?: unknown[]; fixed?: unknown[] }>('sala'), retry: false });
  const clinic = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalFetch<unknown[]>('clinic/appointments'), retry: false });
  const logout = async () => { await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'include' }); window.location.href = '/portal/login'; };
  return <nav aria-label="Navegación del Portal" className="sticky bottom-0 z-10 border-t bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0"><div className="mx-auto flex max-w-2xl items-center justify-between gap-2 text-sm"><Link href="/portal" className="rounded px-2 py-2 font-medium hover:bg-slate-100">Inicio</Link>{sala.data ? <Link href="/portal/sala" className="rounded px-2 py-2 font-medium hover:bg-slate-100">Sala</Link> : null}{clinic.data ? <Link href="/portal/clinic" className="rounded px-2 py-2 font-medium hover:bg-slate-100">Clínica</Link> : null}<Link href="/portal/profile" className="rounded px-2 py-2 font-medium hover:bg-slate-100">Mis datos</Link><button type="button" onClick={logout} className="rounded px-2 py-2 font-medium hover:bg-slate-100">Salir</button></div></nav>;
}

export function PortalFrame({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <main className="min-h-screen bg-slate-50 p-4 pb-24 sm:pb-6"><div className="mx-auto max-w-2xl space-y-5"><header><p className="text-sm font-medium text-muted-foreground">Portal Athleta</p><h1 className="text-2xl font-semibold">{title}</h1></header>{children}<PortalNav /></div></main>; }
