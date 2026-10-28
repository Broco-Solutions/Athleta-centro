'use client';

import React from 'react';
import { createPortal } from 'react-dom';

/** A focusable rail control exposes the same label to mouse and keyboard users. */
export function NavigationTooltip({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const show = (event: React.SyntheticEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setPosition({ top: box.top + box.height / 2, left: box.right + 8 });
  };
  React.useLayoutEffect(() => {
    setPosition(current => {
      if (!current || !ref.current) return current;
      const box = ref.current.getBoundingClientRect();
      return { top: box.top + box.height / 2, left: box.right + 8 };
    });
  }, [label]);
  return <div ref={ref} onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)} onKeyDown={(event) => { if (event.key === 'Escape') setPosition(null); }} aria-describedby={position ? id : undefined}>
    {children}
    {position ? createPortal(<span id={id} role="tooltip" className="pointer-events-none fixed z-[100] max-w-64 -translate-y-1/2 rounded-md bg-sidebar px-3 py-2 text-sm text-white shadow-sm" style={position}>{label}</span>, document.body) : null}
  </div>;
}
