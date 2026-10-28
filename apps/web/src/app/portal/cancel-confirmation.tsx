'use client';
import React from 'react';

export function CancelConfirmation({ text, pending, error, onClose, onConfirm }: { text: string; pending: boolean; error: string; onClose: () => void; onConfirm: () => void }): React.JSX.Element {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // A successful cancellation can remove its row before the dialog closes.
      const target = previous?.isConnected ? previous : document.querySelector<HTMLElement>('main h1');
      target?.focus();
    };
  }, []);
  return <dialog ref={ref} className="portal-dialog" aria-labelledby="cancel-reservation-title" aria-describedby="cancel-reservation-description" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <h2 id="cancel-reservation-title" className="text-xl font-semibold">Cancelar esta fecha</h2>
    <p id="cancel-reservation-description" className="mt-3 text-sm leading-relaxed">{text}</p>
    {error && <p role="alert" className="mt-4">{error}</p>}
    <div className="portal-dialog-actions"><button type="button" autoFocus disabled={pending} className="border" onClick={onClose}>Volver</button><button type="button" disabled={pending} className="portal-dialog-confirm disabled:opacity-60" onClick={onConfirm}>{pending ? 'Cancelando reserva…' : 'Confirmar cancelación'}</button></div>
  </dialog>;
}
