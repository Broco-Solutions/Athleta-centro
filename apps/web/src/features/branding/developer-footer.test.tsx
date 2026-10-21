import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeveloperFooter } from './developer-footer';

it('links the complete developer credit to Broco in a new tab', () => {
  render(<DeveloperFooter />);
  const link = screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' });
  expect(link).toContainElement(screen.getByText('Desarrollado por'));
  expect(link).toContainElement(screen.getByText('Broco Solutions'));
  expect(link).toHaveAttribute('href', 'https://www.brocosolutions.com');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByText('Broco Solutions')).toHaveClass('font-semibold', 'text-foreground', 'underline', 'underline-offset-2');
  expect(screen.getByText('Desarrollado por')).not.toHaveClass('underline');
  expect(link).toHaveClass('hover:text-foreground', 'focus-visible:ring-2');
});
