import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeveloperFooter } from './developer-footer';

it('links the complete developer credit to Broco in a new tab', () => {
  render(<DeveloperFooter />);
  const link = screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' });
  const logo = screen.getByRole('img', { name: 'Broco Solutions' });
  expect(link).toContainElement(screen.getByText('Desarrollado por'));
  expect(link).toContainElement(logo);
  expect(link).toHaveAttribute('href', 'https://www.brocosolutions.com');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(logo).toHaveAttribute('src', expect.stringContaining('logo-broco-solutions.png'));
  expect(screen.queryByText('Broco Solutions')).not.toBeInTheDocument();
  expect(link).toHaveClass('inline-flex', 'items-center', 'gap-1', 'focus-visible:outline-none', 'focus-visible:ring-2');
});


it('uses a white version only on an explicitly dark surface', () => {
  const view = render(<DeveloperFooter surface="dark" />);
  expect(screen.getByRole('img', { name: 'Broco Solutions' })).toHaveClass('brightness-0', 'invert');
  expect(screen.getByRole('link')).toHaveClass('text-zinc-300', 'min-h-11');
  view.rerender(<DeveloperFooter surface="light" />);
  expect(screen.getByRole('img', { name: 'Broco Solutions' })).not.toHaveClass('invert');
  expect(screen.getByRole('link')).toHaveClass('text-muted-foreground');
});
