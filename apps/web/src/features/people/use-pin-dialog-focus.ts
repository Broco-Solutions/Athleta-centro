'use client';
import React from 'react';

export function usePinDialogFocus(phase: 'confirmation' | 'result' | null, onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  close.current = onClose;
  React.useEffect(() => {
    if (!phase) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons?.[0]; const last = buttons?.[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKeyDown); if (trigger?.isConnected) trigger.focus(); };
  }, [phase]);
  return ref;
}
