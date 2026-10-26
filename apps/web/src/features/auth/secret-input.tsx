'use client';
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SecretInput({ secretLabel, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { secretLabel: string }): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  return <span className="relative block">
    <input {...props} type={visible ? 'text' : 'password'} className="h-12 w-full rounded-md border border-border bg-white px-3 pr-12 text-base outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-ring" />
    <button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${secretLabel}`} aria-pressed={visible} onClick={() => setVisible(value => !value)} className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
    </button>
  </span>;
}
