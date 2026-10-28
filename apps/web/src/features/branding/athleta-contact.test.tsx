import React from 'react';
import { render, screen } from '@testing-library/react';
import { AthletaContact } from './athleta-contact';

it('keeps the confirmed institutional destinations once, with safe external links', () => {
  render(<AthletaContact />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'Contacto Athleta: +54 9 3464 56-6340' })).toHaveAttribute('href', 'tel:+5493464566340');
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
