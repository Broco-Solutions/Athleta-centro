import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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


it('paints masked cells without exposing their value to assistive technology', () => {
  render(<label>PIN<PinInput defaultValue="0012" /></label>);
  const cells = document.querySelector('.portal-pin-cells')!;
  expect(cells).toHaveAttribute('aria-hidden', 'true');
  expect(cells).toHaveTextContent('');
  expect(cells.querySelectorAll('.portal-pin-dot')).toHaveLength(4);
  const input = screen.getByLabelText('PIN');
  fireEvent.change(input, { target: { value: '001' } });
  expect(cells.querySelectorAll('.portal-pin-dot')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar PIN' }));
  expect(cells).toHaveTextContent('001');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar PIN' }));
  expect(cells).toHaveTextContent('');
  expect(document.querySelectorAll('input')).toHaveLength(1);
});

it('keeps the native selection when toggling visibility and reflects controlled replacements', async () => {
  const view = render(<label>PIN<PinInput value="0012" onChange={() => undefined} /></label>);
  const input = screen.getByLabelText('PIN') as HTMLInputElement;
  act(() => { input.focus(); input.setSelectionRange(1, 3); }); fireEvent.select(input);
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar PIN' }));
  await waitFor(() => expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]));
  expect(input).toHaveFocus();
  view.rerender(<label>PIN<PinInput value="0312" onChange={() => undefined} /></label>);
  expect(document.querySelector('.portal-pin-cells')).toHaveTextContent('0312');
  expect(input).toHaveAttribute('inputmode', 'numeric');
  expect(input).toHaveAttribute('maxlength', '4');
  expect(input).toHaveAttribute('pattern', '[0-9]{4}');
});
