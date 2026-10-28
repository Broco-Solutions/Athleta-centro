import React from 'react';
import { render, screen } from '@testing-library/react';
import { AthletaContact, athletaWhatsAppHref } from './athleta-contact';

it('keeps the confirmed institutional destinations once, with safe external links', () => {
  render(<AthletaContact />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'WhatsApp Athleta: +54 9 3464 540825' })).toHaveAttribute('href', 'https://wa.me/5493464540825?text=%C2%A1Hola!%20Me%20contacto%20por%20');
  const instagram = screen.getByRole('link', { name: 'Instagram de Athleta' });
  expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/athleta.centro/');
  expect(instagram.querySelector('svg')).toHaveClass('lucide-instagram');
  const address = screen.getByRole('link', { name: 'Yrigoyen 2333, Casilda' });
  expect(address).toHaveAttribute('href', 'https://maps.app.goo.gl/N9UrkAdpigCSzqW77');
  expect(address.querySelector('svg')).toHaveClass('lucide-map-pin');
  for (const link of [instagram, address]) {
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});


it.each([
  [undefined, '¡Hola! Me contacto por '],
  ['', '¡Hola! Me contacto por '],
  ['  \t ', '¡Hola! Me contacto por '],
  ['María', '¡Hola! Soy María. Me contacto por '],
  ['  José   María \n ', '¡Hola! Soy José María. Me contacto por '],
])('encodes only the available first name and keeps the message open', (name, message) => {
  const url = new URL(athletaWhatsAppHref(name));
  expect(url.origin + url.pathname).toBe('https://wa.me/5493464540825');
  expect([...url.searchParams.keys()]).toEqual(['text']);
  expect(url.searchParams.get('text')).toBe(message);
});
