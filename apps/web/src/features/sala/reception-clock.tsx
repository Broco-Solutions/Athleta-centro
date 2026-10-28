'use client';
import React from 'react';

const options = { timeZone: 'America/Argentina/Buenos_Aires' };
export function ReceptionClock(): React.JSX.Element {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <div aria-live="off" className="reception-clock">
    <time dateTime={now?.toISOString()}>{now ? new Intl.DateTimeFormat('es-AR', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now) : '—:—'}</time>
    <span>{now ? new Intl.DateTimeFormat('es-AR', { ...options, weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ' '}</span>
  </div>;
}
