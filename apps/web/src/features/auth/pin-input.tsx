'use client';
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** The native input owns editing; the hidden-from-AT grid only paints its value. */
export function PinInput({ secretLabel = 'PIN', value, defaultValue, onChange, onSelect, onFocus, onBlur, onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { secretLabel?: string }): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const [selection, setSelection] = React.useState({ start: 0, end: 0 });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragAnchor = React.useRef<number | null>(null);
  const selectionToRestore = React.useRef<{ start: number; end: number } | null>(null);
  React.useLayoutEffect(() => {
    const saved = selectionToRestore.current;
    if (saved && inputRef.current) {
      // Finish the native control's type/layout change before restoring editing.
      inputRef.current.getBoundingClientRect();
      inputRef.current.setSelectionRange(saved.start, saved.end);
      setSelection(previous => previous.start === saved.start && previous.end === saved.end ? previous : saved);
      selectionToRestore.current = null;
    }
  }, [visible]);
  const characters = String(value ?? uncontrolledValue);
  const positionAt = (input: HTMLInputElement, clientX: number) => {
    const rect = input.getBoundingClientRect();
    return Math.max(0, Math.min(characters.length, Math.floor((clientX - rect.left) / (rect.width / 4) + 0.5)));
  };
  const selectTo = (input: HTMLInputElement, anchor: number, position: number) => {
    input.setSelectionRange(Math.min(anchor, position), Math.max(anchor, position), position < anchor ? 'backward' : 'forward');
    readSelection(input);
  };
  const readSelection = (input: HTMLInputElement) => {
    const start = input.selectionStart ?? 0, end = input.selectionEnd ?? 0;
    setSelection(previous => previous.start === start && previous.end === end ? previous : { start, end });
  };
  return <span className="portal-pin-control">
    <span className="portal-pin-field">
      <span className="portal-pin-cells" aria-hidden="true">{[0, 1, 2, 3].map(index => {
        const selected = focused && selection.start !== selection.end && index >= selection.start && index < selection.end;
        const caret = focused && selection.start === selection.end && index === Math.min(selection.start, 3);
        return <span key={index} className={selected ? 'portal-pin-cell-selected' : undefined}>
          {characters[index] && (visible ? <span className="portal-pin-digit">{characters[index]}</span> : <span className="portal-pin-dot" />)}
          {caret && <span className={`portal-pin-caret ${selection.start === 4 ? 'portal-pin-caret-after' : characters[index] ? 'portal-pin-caret-before' : ''}`} />}
        </span>;
      })}</span>
      <input {...props} ref={inputRef} value={value} defaultValue={defaultValue} type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className="portal-pin-input"
        onChange={event => { if (value === undefined) setUncontrolledValue(event.currentTarget.value); readSelection(event.currentTarget); onChange?.(event); }}
        onSelect={event => { readSelection(event.currentTarget); onSelect?.(event); }}
        onFocus={event => { setFocused(true); readSelection(event.currentTarget); onFocus?.(event); }}
        onBlur={event => { dragAnchor.current = null; setFocused(false); onBlur?.(event); }}
        onPointerDown={event => {
          if (event.pointerType === 'mouse' && event.button === 0) {
            // Map mouse selection to the cells while leaving touch/long-press native.
            event.preventDefault();
            const input = event.currentTarget;
            const position = positionAt(input, event.clientX);
            const anchor = event.shiftKey ? (input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart) ?? position : position;
            input.focus(); input.setPointerCapture(event.pointerId);
            dragAnchor.current = anchor; selectTo(input, anchor, position);
          }
          onPointerDown?.(event);
        }}
        onPointerMove={event => {
          if (dragAnchor.current !== null && event.buttons === 1) selectTo(event.currentTarget, dragAnchor.current, positionAt(event.currentTarget, event.clientX));
          onPointerMove?.(event);
        }}
        onPointerUp={event => { dragAnchor.current = null; onPointerUp?.(event); }}
        onPointerCancel={event => { dragAnchor.current = null; onPointerCancel?.(event); }}
        onDoubleClick={event => { event.currentTarget.select(); readSelection(event.currentTarget); onDoubleClick?.(event); }}
        onClick={event => {
          const input = event.currentTarget;
          // Keep selected ranges; a single tap places the caret in the painted
          // cell rather than the transparent text's font metrics.
          if (event.detail === 1 && input.selectionStart === input.selectionEnd) {
            const position = positionAt(input, event.clientX);
            input.setSelectionRange(position, position); readSelection(input);
          }
          onClick?.(event);
        }} />
    </span>
    <button type="button" className="portal-pin-eye" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${secretLabel}`} aria-pressed={visible} onMouseDown={event => event.preventDefault()} onClick={() => {
      const input = inputRef.current;
      const start = input?.selectionStart ?? 0;
      const end = input?.selectionEnd ?? start;
      selectionToRestore.current = { start, end };
      input?.focus({ preventScroll: true });
      setVisible(current => !current);
    }}>{visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button>
  </span>;
}
