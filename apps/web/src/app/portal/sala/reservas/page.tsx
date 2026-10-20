'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PortalFrame, portalFetch, formatDate, formatTime } from '../../portal-ui';

type ReservationsData = {
  reservations: Array<{
    id: string;
    date: string;
    startTime?: string;
    serviceType?: { name: string } | null;
    cancelledAt?: string | null;
  }>;
};

export default function PortalReservations(): React.JSX.Element {
  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<ReservationsData>('sala'), retry: false });
  const reservations = data.data?.reservations.filter(item => !item.cancelledAt) ?? [];

  return <PortalFrame title="Mis reservas" backToHome>
    {data.isLoading ? <p role="status">Cargando reservas…</p>
      : data.isError || !data.data ? <p role="alert">No pudimos cargar tus reservas. Intentá nuevamente.</p>
      : reservations.length ? <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
        {reservations.map(item => <li key={item.id} className="py-4 text-sm">
          <p className="font-semibold">{formatDate(item.date)}{item.startTime ? ` · ${formatTime(item.startTime)}` : ''}</p>
          <p className="mt-1">{item.serviceType?.name ?? 'Sala'} · Reservado</p>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">No tenés próximas reservas.</p>}
  </PortalFrame>;
}
