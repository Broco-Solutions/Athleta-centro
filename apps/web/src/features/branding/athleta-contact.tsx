import React from 'react';
import { Phone } from 'lucide-react';

// Confirmed institutional contact: docs/product/HEALTH_DECLARATION_IMPLEMENTATION.md.
export const athletaContact = { phone: '+54 9 3464 56-6340', href: 'tel:+5493464566340' } as const;

export function AthletaContact(): React.JSX.Element {
  return <a href={athletaContact.href} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Phone size={16} aria-hidden="true" /><span>Contacto Athleta: {athletaContact.phone}</span></a>;
}
