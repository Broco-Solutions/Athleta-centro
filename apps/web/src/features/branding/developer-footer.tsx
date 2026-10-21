import React from 'react';

export function DeveloperFooter(): React.JSX.Element {
  return <a href="https://www.brocosolutions.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span>Desarrollado por</span>{' '}<span className="font-semibold">Broco Solutions</span>
  </a>;
}
