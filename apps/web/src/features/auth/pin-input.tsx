'use client';
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** One native credential input preserves paste, selection and password managers. */
export function PinInput({ secretLabel = 'PIN', ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { secretLabel?: string }): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  return <span className="portal-pin-control">
    <span className="portal-pin-field">
      <span className="portal-pin-cells" aria-hidden="true">{[0, 1, 2, 3].map(index => <span key={index} />)}</span>
      <input {...props} ref={inputRef} type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className="portal-pin-input" />
    </span>
    <button type="button" className="portal-pin-eye" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${secretLabel}`} aria-pressed={visible} onMouseDown={event => event.preventDefault()} onClick={() => {
      const input = inputRef.current;
      const start = input?.selectionStart ?? 0;
      const end = input?.selectionEnd ?? start;
      setVisible(value => !value);
      requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start, end); });
    }}>{visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button>
  </span>;
}
