import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PinInput } from './pin-input';

it('keeps one native credential input, leading zeros and visibility without submitting', () => {
  const submit = vi.fn(event => event.preventDefault());
  render(<form onSubmit={submit}><label htmlFor="pin-test">PIN</label><PinInput id="pin-test" autoComplete="current-password" defaultValue="0012"/><button>Ingresar</button></form>);
  const input = screen.getByLabelText('PIN');
  expect(document.querySelectorAll('input')).toHaveLength(1);
  expect(input).toHaveValue('0012');
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveAttribute('autocomplete', 'current-password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar PIN' }));
  expect(input).toHaveValue('0012');
  expect(input).toHaveAttribute('type', 'text');
  expect(submit).not.toHaveBeenCalled();
});
