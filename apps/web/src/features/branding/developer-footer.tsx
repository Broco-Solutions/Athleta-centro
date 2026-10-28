import React from 'react';
import Image from 'next/image';

export function DeveloperFooter({ surface = 'light' }: { surface?: 'light' | 'dark' }): React.JSX.Element {
  return <a href="https://www.brocosolutions.com" target="_blank" rel="noopener noreferrer" aria-label="Desarrollado por Broco Solutions" className={`inline-flex min-h-11 items-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${surface === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}>
    <span>Desarrollado por</span>
    {/* The official PNG is transparent; cover removes only its empty outer margin. */}
    <Image src="/logo-broco-solutions.png" width={1024} height={1024} sizes="88px" alt="Broco Solutions" className={`h-7 w-[5.5rem] shrink-0 object-cover object-center ${surface === 'dark' ? 'brightness-0 invert' : ''}`} />
  </a>;
}
