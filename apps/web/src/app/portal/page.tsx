'use client';
import React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarDays, Check, ChevronRight, Dumbbell, Plus } from 'lucide-react';
import { PortalFrame, portalFetch, formatDateTime, formatTime } from './portal-ui';

type Me = { firstName: string; lastName: string };
type Commitment = { date: string; startTime: string; status: string; reservationId?: string };
type Sala = {
  reservations: Array<{ id: string; date: string; startTime: string; cancelledAt?: string | null }>;
  fixedOccurrences?: Array<{ fixedSalaBookingId: string; date: string; startTime: string; status: 'RESERVED' | 'PENDING_PAYMENT' | 'CANCELLED' | 'ATTENDED' | 'ABSENT'; cancelledForNonPayment: boolean }>;
  routine?: { days: Array<{ id: string; name?: string | null }> } | null;
  validity: { hasValidAccess: boolean; validUntil: string | null };
};
type Appointment = { id: string; startAt: string; status: string };
const card = 'rounded-xl border bg-surface p-5 sm:p-6';
const operationalDate = (value: string): Date => new Date(value.slice(0, 10) + 'T12:00:00-03:00');
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...options }).format(operationalDate(value));

export default function PortalHome(): React.JSX.Element {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ['portal', 'me'], queryFn: () => portalFetch<Me>('me') });
  const sala = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<Sala>('sala'), retry: false });
  const clinic = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalFetch<Appointment[]>('clinic/appointments'), retry: false });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { csrfToken } = await portalFetch<{ csrfToken: string }>('auth/session');
      return portalFetch('sala/reservations/' + id + '/cancel', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['portal', 'sala'] }),
  });
  const now = Date.now();
  const commitments: Commitment[] = [
    ...(sala.data?.reservations ?? []).filter(item => !item.cancelledAt).map(item => ({ date: item.date, startTime: formatTime(item.startTime), status: 'RESERVED', reservationId: item.id })),
    ...(sala.data?.fixedOccurrences ?? []).filter(item => !item.cancelledForNonPayment && ['RESERVED', 'PENDING_PAYMENT'].includes(item.status)).map(item => ({ date: item.date, startTime: formatTime(item.startTime), status: item.status })),
  ];
  const timestamp = (item: Commitment): number => new Date(item.date.slice(0, 10) + 'T' + item.startTime + ':00-03:00').getTime();
  const next = commitments.filter(item => timestamp(item) >= now).sort((a, b) => timestamp(a) - timestamp(b))[0];
  const nextClinic = clinic.data?.filter(item => item.status === 'SCHEDULED' && new Date(item.startAt).getTime() >= now).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const routineSummary = sala.data?.routine?.days.map(day => day.name?.trim()).filter(Boolean).join(' · ') || 'Rutina actual';

  return <PortalFrame title={me.data ? 'Hola, ' + me.data.firstName : 'Hola'} subtitle="Tu próximo turno y lo que necesitás para entrenar." action={sala.data ? <div><Link href="/portal/sala/reservar" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold hover:bg-primary-hover"><Plus size={18} aria-hidden="true" />Reservar en Sala</Link><p className="mt-2 text-center text-xs text-muted-foreground">Próximos 30 días · según disponibilidad</p></div> : undefined}>
    {me.isError ? <p role="alert">No pudimos cargar tus datos.</p> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section className={card + ' lg:col-start-1 lg:row-start-1'} aria-labelledby="next-heading">
        <h2 id="next-heading" className="font-semibold">Tu próximo turno</h2>
        {sala.isLoading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Cargando tus turnos…</p> : sala.isError ? <p role="alert" className="mt-4 text-sm">No pudimos cargar tus turnos de Sala.</p> : next ? <div className="mt-5 flex items-start gap-4">
          <div className="min-w-16 rounded-lg border bg-surface-muted px-3 py-2 text-center"><strong className="block text-3xl">{dateLabel(next.date, { day: '2-digit' })}</strong><span className="text-xs uppercase text-muted-foreground">{dateLabel(next.date, { month: 'short' })}</span></div>
          <div className="min-w-0 flex-1"><h3 className="font-semibold">Entrenamiento en Sala</h3><p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel(next.date, { weekday: 'long', day: '2-digit', month: 'long' })} · {next.startTime}</p>
            <span className={'mt-3 inline-flex rounded-md px-2 py-1 text-xs font-medium ' + (next.status === 'PENDING_PAYMENT' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800')}>{next.status === 'PENDING_PAYMENT' ? 'Pendiente de renovación' : 'Reservado'}</span>
            {next.reservationId ? <div><button type="button" className="mt-2 min-h-11 text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-50" disabled={cancel.isPending} onClick={() => cancel.mutate(next.reservationId!)}>Cancelar turno</button></div> : null}
          </div>
        </div> : <p className="mt-4 text-sm text-muted-foreground">No tenés próximos turnos en Sala.</p>}
        {cancel.isError ? <p role="alert" className="mt-3 text-sm">{cancel.error.message}</p> : null}
      </section>
      {sala.data ? <section className={card + ' lg:col-start-2 lg:row-start-1'} aria-labelledby="payment-heading"><h2 id="payment-heading" className="font-semibold">Vigencia de Sala</h2><p className={'mt-4 flex items-center gap-2 text-sm font-medium ' + (sala.data.validity.hasValidAccess ? 'text-emerald-800' : 'text-amber-800')}>{sala.data.validity.hasValidAccess ? <><Check size={18} aria-hidden="true" />Vigente hasta {sala.data.validity.validUntil?.split('-').reverse().join('/')}</> : 'Sin vigencia'}</p></section> : null}
      {sala.data?.routine ? <section className={card + ' lg:col-start-1 lg:row-start-2'} aria-labelledby="routine-heading"><div className="flex items-center justify-between gap-3"><h2 id="routine-heading" className="flex items-center gap-2 font-semibold"><Dumbbell size={18} aria-hidden="true" />Tu rutina activa</h2><span className="rounded-md bg-surface-muted px-2 py-1 text-xs text-muted-foreground">Solo lectura</span></div><p className="mt-3 text-sm text-muted-foreground">{routineSummary}</p><Link href="/portal/sala#rutina" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium">Ver mi rutina<ChevronRight size={16} aria-hidden="true" /></Link></section> : null}
      {sala.data ? <section className={card + ' lg:col-start-2 lg:row-start-2'} aria-labelledby="sala-heading"><h2 id="sala-heading" className="font-semibold">Tu Sala</h2><div className="mt-3 divide-y">{[
        { href: '/portal/sala#turnos-fijos', label: 'Mis turnos fijos', description: 'Consultá y gestioná tus horarios.', Icon: CalendarDays },
        { href: '/portal/sala#evaluaciones', label: 'Evaluaciones físicas', description: 'Consultá tus evaluaciones por fecha.', Icon: Activity },
      ].map(({ href, label, description, Icon }) => <Link key={href} href={href} className="flex min-h-16 items-center gap-3 py-3"><Icon size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="flex-1"><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{description}</span></span><ChevronRight size={16} aria-hidden="true" /></Link>)}</div><p className="mt-3 text-xs text-muted-foreground">Las reservas están sujetas a disponibilidad.</p></section> : null}
      {nextClinic ? <section className={card + ' lg:col-start-2'} aria-labelledby="clinic-heading"><h2 id="clinic-heading" className="font-semibold">Clínica</h2><p className="mt-3 text-sm text-muted-foreground">Próximo turno</p><p className="mt-1 text-sm font-medium">{formatDateTime(nextClinic.startAt)}</p><Link href="/portal/clinic" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium">Ver turnos<ChevronRight size={16} aria-hidden="true" /></Link></section> : null}
    </div>
    <p className="text-center text-sm text-muted-foreground">¿Necesitás ayuda con tu reserva o tu cuenta? Consultá con Athleta.</p>
  </PortalFrame>;
}
