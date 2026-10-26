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
  expect(link).toHaveAttribute('rel', 'noreferrer');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(logo).toHaveAttribute('src', expect.stringContaining('logo-broco-solutions.png'));
  expect(screen.queryByText('Broco Solutions')).not.toBeInTheDocument();
  expect(link).toHaveClass('inline-flex', 'items-center', 'gap-2', 'focus-visible:outline-none', 'focus-visible:ring-2');
});
