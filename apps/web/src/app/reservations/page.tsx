'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { ReservationsTimeline } from '../../features/reservations/reservations-timeline';

function today(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }
export default function ReservationsPage(): React.JSX.Element { const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const [date, setDate] = useState(today); return <WorkspaceShell active="Reservas"><main className="mx-auto max-w-7xl space-y-5"><ReservationsTimeline date={date} onDateChange={setDate} csrfToken={session.data?.csrfToken ?? ''} /></main></WorkspaceShell>; }
