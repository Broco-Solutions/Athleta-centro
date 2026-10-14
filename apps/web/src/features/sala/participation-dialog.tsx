'use client';
import { createPortal } from 'react-dom';
import React, { useEffect, useRef } from 'react';

export function ParticipationDialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-md border border-border bg-surface p-6 shadow-sm" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled)') ?? []);
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
  }}><h2 className="text-xl font-semibold">{title}</h2>{children}</div></div>, document.body);
}
