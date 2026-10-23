'use client';
import React from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { PortalFrame, portalFetch, formatDate, formatTime, today } from '../../portal-ui';

type ReservationsData = {
  reservations: Array<{
    id: string;
    date: string;
    startTime?: string;
    cancelledAt?: string | null;
  }>;
  fixedOccurrences?: Array<{
    fixedSalaBookingId: string;
    date: string;
    startTime: string;
    status: 'RESERVED' | 'PENDING_PAYMENT' | 'CANCELLED' | 'ATTENDED' | 'ABSENT';
    cancelledForNonPayment: boolean;
  }>;
};
type UpcomingTurn = { key: string; date: string; startTime?: string } & (
  | { kind: 'replacement'; id: string }
  | { kind: 'fixed'; fixedSalaBookingId: string }
);

export default function PortalReservations(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [message, setMessage] = React.useState('');
  const [cancelError, setCancelError] = React.useState('');
  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<ReservationsData>('sala'), retry: false });
  const currentDate = today();
  const reservations: UpcomingTurn[] = [
    ...(data.data?.reservations ?? []).filter(item => !item.cancelledAt).map(item => ({ ...item, key: `replacement:${item.id}`, kind: 'replacement' as const })),
    ...(data.data?.fixedOccurrences ?? []).filter(item => item.status === 'RESERVED').map(item => ({ ...item, key: `fixed:${item.fixedSalaBookingId}:${item.date}`, kind: 'fixed' as const })),
  ].filter(item => item.date >= currentDate && (item.date !== currentDate || !item.startTime || new Date(`${item.date}T${formatTime(item.startTime)}:00-03:00`).getTime() >= Date.now()))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const pendingReservationIds = useMutationState<string | undefined>({
    filters: { mutationKey: ['portal', 'sala', 'cancel-reservation'], status: 'pending' },
    select: mutation => (mutation.state.variables as UpcomingTurn | undefined)?.key,
  });
  const cancelReservation = useMutation({
    mutationKey: ['portal', 'sala', 'cancel-reservation'],
    mutationFn: async (reservation: UpcomingTurn) => {
      const token = (await portalFetch<{ csrfToken: string }>('auth/session')).csrfToken;
      const endpoint = reservation.kind === 'fixed'
        ? `sala/fixed-bookings/${reservation.fixedSalaBookingId}/occurrences/${reservation.date}/cancel`
        : `sala/reservations/${reservation.id}/cancel`;
      await portalFetch(endpoint, {
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

  const requestCancellation = (reservation: UpcomingTurn): void => {
    const time = reservation.startTime ? ` a las ${formatTime(reservation.startTime)}` : '';
    if (!window.confirm(`¿Cancelar la reserva del ${formatDate(reservation.date)}${time}?`)) return;
    setMessage('');
    setCancelError('');
    cancelReservation.mutate(reservation);
  };

  return <PortalFrame title="Mis próximos turnos" backToHome>
    {data.isLoading ? <p role="status">Cargando reservas…</p>
      : data.isError || !data.data ? <p role="alert">No pudimos cargar tus reservas. Intentá nuevamente.</p>
      : <>
        {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
        {cancelError ? <p role="alert" className="text-sm text-red-700">{cancelError}</p> : null}
        {reservations.length ? <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
          {reservations.map(item => <li key={item.key} className="py-4 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{formatDate(item.date)}{item.startTime ? ` · ${formatTime(item.startTime)}` : ''}</p>
              </div>
              <Button variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={pendingReservationIds.includes(item.key)} onClick={() => requestCancellation(item)}>
                {pendingReservationIds.includes(item.key) ? 'Cancelando…' : 'Cancelar esta fecha'}
              </Button>
            </div>
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">No tenés próximos turnos disponibles.</p>}
      </>}
  </PortalFrame>;
}
