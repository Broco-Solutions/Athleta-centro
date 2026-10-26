import React from 'react';
import Image from 'next/image';

export function DeveloperFooter(): React.JSX.Element {
  return <a href="https://www.brocosolutions.com" target="_blank" rel="noreferrer" aria-label="Desarrollado por Broco Solutions" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span>Desarrollado por</span>
    <Image src="/logo-broco-solutions.png" width={1024} height={1024} sizes="72px" alt="Broco Solutions" className="h-5 w-[4.5rem] object-cover object-center" />
  </a>;
}
