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
});
