'use client';
import React from 'react';
import { z } from 'zod';
import { todayOperational } from '../../lib/operational-date';

export function usePaperDeclaration() {
  const [confirmed, setConfirmed] = React.useState(false);
  const [signedOn, setSignedOn] = React.useState('');
  return { confirmed, signedOn, setConfirmed, setSignedOn,
    input: (): { paperHealthDeclarationSignedOn?: string } => {
      if (!confirmed) return {};
      if (!z.iso.date().safeParse(signedOn).success || signedOn > todayOperational()) throw new Error('Ingresá la fecha real de firma, sin fechas futuras.');
      return { paperHealthDeclarationSignedOn: signedOn };
    },
  };
}
export function PaperDeclarationFields({ value, disabled = false }: { value: ReturnType<typeof usePaperDeclaration>; disabled?: boolean }): React.JSX.Element {
  const anniversary = value.signedOn ? new Date(`${value.signedOn}T00:00:00Z`) : null;
  if (anniversary && !Number.isNaN(anniversary.getTime())) {
    const month = anniversary.getUTCMonth();
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
  }
  const expired = anniversary && !Number.isNaN(anniversary.getTime()) && anniversary.toISOString().slice(0, 10) < todayOperational();
  return <fieldset disabled={disabled} className="space-y-3 border-t border-border pt-4 sm:col-span-2">
    <legend className="text-sm font-semibold">Declaración de salud</legend>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.confirmed} onChange={event => { value.setConfirmed(event.target.checked); if (!event.target.checked) value.setSignedOn(''); }} />El alumno ya presentó la declaración de salud firmada en papel.</label>
    {value.confirmed ? <><label className="grid gap-1 text-sm">Fecha de firma *<input aria-label="Fecha de firma" type="date" required max={todayOperational()} className="min-h-11 rounded-md border border-border bg-white px-3" value={value.signedOn} onChange={event => value.setSignedOn(event.target.value)} /></label>
      <p className="text-sm text-muted-foreground">Se registrará la declaración presentada en papel. No es necesario cargar el documento ni completar nuevamente sus respuestas.</p>
      {expired ? <p role="status" className="text-sm text-amber-800">La declaración ya se encuentra vencida. Se conservará en el historial, pero el alumno deberá completar una nueva para utilizar el Portal.</p> : null}</> : null}
  </fieldset>;
}
