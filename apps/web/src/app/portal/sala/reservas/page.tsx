'use client';
import React from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
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
type Reservation = ReservationsData['reservations'][number];

export default function PortalReservations(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [message, setMessage] = React.useState('');
  const [cancelError, setCancelError] = React.useState('');
  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<ReservationsData>('sala'), retry: false });
  const reservations = data.data?.reservations.filter(item => !item.cancelledAt) ?? [];
  const pendingReservationIds = useMutationState<string | undefined>({
    filters: { mutationKey: ['portal', 'sala', 'cancel-reservation'], status: 'pending' },
    select: mutation => (mutation.state.variables as Reservation | undefined)?.id,
  });
  const cancelReservation = useMutation({
    mutationKey: ['portal', 'sala', 'cancel-reservation'],
    mutationFn: async (reservation: Reservation) => {
      const token = (await portalFetch<{ csrfToken: string }>('auth/session')).csrfToken;
      await portalFetch(`sala/reservations/${reservation.id}/cancel`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
      });
    },
    onSuccess: async () => {
      setMessage('Reserva cancelada correctamente.');
      setCancelError('');
      await queryClient.invalidateQueries({ queryKey: ['portal', 'sala'] });
    },
    onError: async () => {
      setMessage('');
      setCancelError('No pudimos cancelar la reserva. Intentá nuevamente.');
      await queryClient.invalidateQueries({ queryKey: ['portal', 'sala'] });
    },
  });

  const requestCancellation = (reservation: Reservation): void => {
    const time = reservation.startTime ? ` a las ${formatTime(reservation.startTime)}` : '';
    if (!window.confirm(`¿Cancelar la reserva del ${formatDate(reservation.date)}${time}?`)) return;
    setMessage('');
    setCancelError('');
    cancelReservation.mutate(reservation);
  };

  return <PortalFrame title="Mis reservas" backToHome>
    {data.isLoading ? <p role="status">Cargando reservas…</p>
      : data.isError || !data.data ? <p role="alert">No pudimos cargar tus reservas. Intentá nuevamente.</p>
      : <>
        {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
        {cancelError ? <p role="alert" className="text-sm text-red-700">{cancelError}</p> : null}
        {reservations.length ? <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
          {reservations.map(item => <li key={item.id} className="py-4 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{formatDate(item.date)}{item.startTime ? ` · ${formatTime(item.startTime)}` : ''}</p>
                <p className="mt-1">{item.serviceType?.name ?? 'Sala'} · Reservado</p>
              </div>
              <Button variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={pendingReservationIds.includes(item.id)} onClick={() => requestCancellation(item)}>
                {pendingReservationIds.includes(item.id) ? 'Cancelando…' : 'Cancelar reserva'}
              </Button>
            </div>
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">No tenés próximas reservas.</p>}
      </>}
  </PortalFrame>;
}
