import React from 'react';
import { Instagram, MapPin, Phone } from 'lucide-react';

// Public institutional destinations confirmed by Athleta.
export const athletaContact = {
  phone: '+54 9 3464 56-6340', href: 'tel:+5493464566340',
  instagram: 'https://www.instagram.com/athleta.centro/',
  address: 'Yrigoyen 2333, Casilda', maps: 'https://maps.app.goo.gl/N9UrkAdpigCSzqW77',
} as const;
const contactLink = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AthletaContact(): React.JSX.Element {
  return <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3">
    <a href={athletaContact.href} className={contactLink}><Phone size={16} className="shrink-0" aria-hidden="true" /><span>Contacto Athleta: {athletaContact.phone}</span></a>
    <a href={athletaContact.instagram} aria-label="Instagram de Athleta" target="_blank" rel="noopener noreferrer" className={contactLink}><Instagram size={18} className="shrink-0" aria-hidden="true" /><span>Instagram</span></a>
    <a href={athletaContact.maps} target="_blank" rel="noopener noreferrer" className={contactLink}><MapPin size={18} className="shrink-0" aria-hidden="true" /><span>{athletaContact.address}</span></a>
  </div>;
}
