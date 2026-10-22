import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HealthForm, healthAge, parseHealthDocument, type FormDocument } from './health-form';
const person = { firstName: 'Alumno', lastName: 'Sintético', dni: '00000001', birthDate: '1990-01-01', phone: '0000000000' };
const consentKeys = ['physicalActivity', 'truthfulness', 'emergenciesAndPrivacy', 'healthDataProcessing', 'kinesiology', 'manualEvaluation', 'therapeuticExercise', 'manualTherapy', 'physicalAgents', 'dryNeedling', 'taping', 'shareWithDoctors', 'shareWithClubs', 'clinicalImage', 'institutionalImage'] as const;
const document: FormDocument = { version: 'SYNTHETIC-TEST-ONLY', questions: [{ id: 'testQuestion', category: 'Categoría sintética', text: 'Pregunta sintética' }], consents: consentKeys.map(key => ({ key, text: `Texto sintético ${key}` })), guardianConfirmation: 'Confirmación sintética del responsable', finalConfirmation: 'Confirmación sintética final' };
async function next() { fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); await waitFor(() => expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '1')); }
function fillContact() { fireEvent.change(screen.getByLabelText('Contacto de emergencia *'), { target: { value: 'Contacto sintético' } }); fireEvent.change(screen.getByLabelText('Teléfono de emergencia *'), { target: { value: '0000000000' } }); }
async function goTo(step: number) { while (Number(screen.getByRole('progressbar').getAttribute('aria-valuenow')) < step) { const current = screen.getByRole('progressbar').getAttribute('aria-valuenow'); fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); await waitFor(() => expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', current)); } }

it('walks through all five steps without the DOCX, preserves answers and never submits invented consent', async () => {
  const submit = vi.fn(); const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<HealthForm person={person} document={null} onSubmit={submit} />);
  fillContact(); await next();
  fireEvent.change(screen.getByLabelText('Práctica deportiva'), { target: { value: 'YES' } });
  fireEvent.change(screen.getByLabelText('Deporte (opcional)'), { target: { value: 'Deporte sintético' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  expect(screen.getByLabelText('Contacto de emergencia *')).toHaveValue('Contacto sintético');
  await next(); expect(screen.getByLabelText('Deporte (opcional)')).toHaveValue('Deporte sintético');
  await goTo(5);
  expect(screen.getByRole('button', { name: 'Confirmar y finalizar' })).toBeDisabled();
  expect(screen.getByText('La finalización está pendiente del documento fuente.')).toBeVisible();
  expect(submit).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Editar datos personales' }));
  expect(screen.getByLabelText('Teléfono de emergencia *')).toHaveValue('0000000000');
});
it('shows required field errors next to the answers and keeps the first step', async () => {
  render(<HealthForm person={person} document={null} onSubmit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Ingresá el contacto de emergencia.')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});
it('accepts empty kinesiological fields and all optional authorizations rejected without preselected radios', async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<HealthForm person={person} document={document} onSubmit={submit} />);
  fillContact(); await goTo(4);
  expect(screen.getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true);
  for (const group of screen.getAllByRole('group')) {
    const required = /Actividad física y entrenamiento|Declaración de veracidad|Emergencias y protección de datos/.test(group.textContent ?? '');
    fireEvent.click(within(group).getByRole('radio', { name: required ? 'Sí' : 'No' }));
  }
  await goTo(5);
  fireEvent.click(screen.getByLabelText('Confirmación sintética final'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ confirmed: true, documentVersion: document.version, kinesiology: {}, answers: {}, consents: { physicalActivity: true, truthfulness: true, emergenciesAndPrivacy: true, shareWithDoctors: false, shareWithClubs: false, clinicalImage: false, institutionalImage: false } });
});
it('requires guardian identification for minors and calculates adulthood on the birthday', async () => {
  expect(healthAge('2008-10-23', '2026-10-22')).toBe(17); expect(healthAge('2008-10-22', '2026-10-22')).toBe(18);
  render(<HealthForm person={{ ...person, birthDate: '2015-01-01' }} document={null} onSubmit={vi.fn()} />);
  fillContact(); fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Identificá al responsable del menor.')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});
it('rejects missing, empty and incomplete document content', () => { expect(parseHealthDocument(null)).toBeNull(); expect(parseHealthDocument({ ...document, consents: [] })).toBeNull(); expect(parseHealthDocument(document)).toEqual(document); });

it('requires the responsible adult confirmation in the personal-data step', async () => {
  render(<HealthForm person={{ ...person, birthDate: '2015-01-01' }} document={document} onSubmit={vi.fn()} />);
  fillContact();
  fireEvent.change(screen.getByLabelText('Nombre y apellido del padre, madre o tutor *'), { target: { value: 'Tutor sintético' } });
  fireEvent.change(screen.getByLabelText('DNI del responsable *'), { target: { value: '00000002' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Se requiere la confirmación del responsable.')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: /^Confirmación sintética del responsable/ }));
  await next();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
});
