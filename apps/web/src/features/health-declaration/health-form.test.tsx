import React from 'react';
import { HEALTH_DOCUMENT } from '../../../../api/src/sala/health-declaration/health-document-content';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HealthForm, healthAge, parseHealthDocument, finalHealthConfirmation, type FormDocument } from './health-form';
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
  fillContact(); await goTo(3);
  fireEvent.click(screen.getByRole('radio', { name: 'Prefiero no informar' }));
  await goTo(4);
  expect(screen.getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true);
  for (const group of screen.getAllByRole('group')) {
    const required = /Actividad física y entrenamiento|Declaración de veracidad|Emergencias y protección de datos|Tratamiento de información médica/.test(group.textContent ?? '');
    fireEvent.click(within(group).getByRole('radio', { name: required ? 'Sí' : 'No' }));
  }
  await goTo(5);
  fireEvent.click(screen.getByLabelText(finalHealthConfirmation));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ confirmed: true, documentVersion: document.version, kinesiology: {}, answers: { testQuestion: { answer: 'NOT_DISCLOSED' } }, consents: { physicalActivity: true, truthfulness: true, emergenciesAndPrivacy: true, shareWithDoctors: false, shareWithClubs: false, clinicalImage: false, institutionalImage: false } });
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

function authorizeRequiredConsents() {
  for (const group of screen.getAllByRole('group')) {
    const required = /Actividad física y entrenamiento|Declaración de veracidad|Emergencias y protección de datos|Tratamiento de información médica/.test(group.textContent ?? '');
    fireEvent.click(within(group).getByRole('radio', { name: required ? 'Sí' : 'No' }));
  }
}
const groupedDocument: FormDocument = { ...document, questions: [
  { id: 'first', category: 'Cardiovasculares', text: 'Condición cardiovascular completa' },
  { id: 'second', category: 'Cardiovasculares', text: 'Segunda condición completa' },
  { id: 'notes', category: 'Cardiovasculares', text: 'Observaciones', responseType: 'TEXT' },
  { id: 'medication', category: 'Medicación', text: 'Medicaciones actuales (nombre y dosis)', responseType: 'TEXT' },
] };
it('groups conditions once, requires every category and clears descriptions when deselected or excluded', async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<HealthForm person={person} document={groupedDocument} onSubmit={submit} />);
  fillContact(); await goTo(3);
  expect(screen.getAllByText('Cardiovasculares', { exact: true })).toHaveLength(1);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  expect(screen.getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findAllByRole('alert')).toHaveLength(2);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  const cardiovascular = screen.getByRole('group', { name: 'Cardiovasculares' });
  const medication = screen.getByRole('group', { name: 'Medicación' });
  const condition = within(cardiovascular).getByRole('checkbox', { name: 'Condición cardiovascular completa' });
  fireEvent.click(condition);
  const description = 'Descripción de Condición cardiovascular completa (opcional)';
  fireEvent.change(screen.getByLabelText(description), { target: { value: 'Detalle a eliminar' } });
  fireEvent.click(condition);
  expect(screen.queryByLabelText(description)).not.toBeInTheDocument();
  expect(within(cardiovascular).getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(condition);
  expect(screen.getByLabelText(description)).toHaveValue('');
  fireEvent.change(screen.getByLabelText(description), { target: { value: 'Otro detalle a eliminar' } });
  fireEvent.click(within(cardiovascular).getByRole('radio', { name: 'Prefiero no informar' }));
  expect(condition).not.toBeChecked();
  expect(screen.queryByLabelText(description)).not.toBeInTheDocument();
  fireEvent.click(within(cardiovascular).getByRole('radio', { name: 'Ninguna de las anteriores' }));
  expect(within(cardiovascular).getByRole('radio', { name: 'Prefiero no informar' })).not.toBeChecked();
  fireEvent.click(within(medication).getByRole('radio', { name: 'Prefiero no informar' }));
  await goTo(4); authorizeRequiredConsents(); await goTo(5);
  fireEvent.click(screen.getByLabelText(finalHealthConfirmation));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0]?.[0].answers).toEqual({ first: { answer: 'NO' }, second: { answer: 'NO' }, notes: { answer: 'NO' }, medication: { answer: 'NOT_DISCLOSED' } });
});
it('keeps text-only questions optional and allows an explicit response by entering information', async () => {
  render(<HealthForm person={person} document={groupedDocument} onSubmit={vi.fn()} />);
  fillContact(); await goTo(3);
  fireEvent.click(within(screen.getByRole('group', { name: 'Cardiovasculares' })).getByRole('radio', { name: 'Ninguna de las anteriores' }));
  const medication = screen.getByLabelText('Medicaciones actuales (nombre y dosis) (opcional)');
  fireEvent.change(medication, { target: { value: 'Medicación sintética' } });
  fireEvent.change(medication, { target: { value: '' } });
  expect(within(screen.getByRole('group', { name: 'Medicación' })).getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  fireEvent.change(medication, { target: { value: 'Medicación sintética' } });
  await goTo(4);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
});
it('shows optional kinesiology fields only after Yes and clears hidden data and procedure consents after No', async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<HealthForm person={person} document={document} onSubmit={submit} />);
  fillContact(); await goTo(2);
  const consultation = screen.getByRole('group', { name: 'Consulta kinésica (opcional)' });
  expect(within(consultation).getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  expect(screen.queryByLabelText('Motivo de consulta (opcional)')).not.toBeInTheDocument();
  fireEvent.click(within(consultation).getByRole('radio', { name: 'Sí' }));
  expect(screen.getByLabelText('Estudios (opcional)')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Motivo de consulta (opcional)'), { target: { value: 'Motivo a eliminar' } });
  await goTo(3); fireEvent.click(screen.getByRole('radio', { name: 'Ninguna de las anteriores' })); await goTo(4);
  fireEvent.click(within(screen.getByRole('group', { name: 'Punción seca (opcional)' })).getByRole('radio', { name: 'Sí' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Consulta kinésica (opcional)' })).getByRole('radio', { name: 'No' }));
  expect(screen.queryByLabelText('Motivo de consulta (opcional)')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group', { name: 'Consulta kinésica (opcional)' })).getByRole('radio', { name: 'Sí' }));
  expect(screen.getByLabelText('Motivo de consulta (opcional)')).toHaveValue('');
  fireEvent.click(within(screen.getByRole('group', { name: 'Consulta kinésica (opcional)' })).getByRole('radio', { name: 'No' }));
  await goTo(4);
  expect(screen.queryByRole('group', { name: 'Punción seca (opcional)' })).not.toBeInTheDocument();
  authorizeRequiredConsents(); await goTo(5);
  fireEvent.click(screen.getByLabelText(finalHealthConfirmation));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ kinesiology: {}, consents: { kinesiology: false, dryNeedling: false } });
});
it('requires medical processing authorization and the final declaration confirmation', async () => {
  const submit = vi.fn();
  render(<HealthForm person={person} document={document} onSubmit={submit} />);
  fillContact(); await goTo(3); fireEvent.click(screen.getByRole('radio', { name: 'Ninguna de las anteriores' })); await goTo(4);
  authorizeRequiredConsents();
  const processing = screen.getByRole('group', { name: 'Tratamiento de información médica *' });
  fireEvent.click(within(processing).getByRole('radio', { name: 'No' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Esta confirmación es obligatoria.')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  fireEvent.click(within(processing).getByRole('radio', { name: 'Sí' })); await goTo(5);
  expect(screen.getByLabelText(finalHealthConfirmation)).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
  expect(await screen.findByText('Confirmá la presentación para finalizar.')).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});

it('shows the source legal obligations once in the final review, without exposing the document fingerprint', async () => {
  const source = parseHealthDocument(HEALTH_DOCUMENT)!;
  render(<HealthForm person={person} document={source} onSubmit={vi.fn()} />);
  fillContact(); await goTo(2);
  fireEvent.click(within(screen.getByRole('group', { name: 'Consulta kinésica (opcional)' })).getByRole('radio', { name: 'Sí' }));
  expect(screen.queryByText(/Ley 25.326/)).not.toBeInTheDocument();
  await goTo(3);
  expect(screen.queryByText(/Ley 25.326/)).not.toBeInTheDocument();
  for (const group of screen.getAllByRole('group')) fireEvent.click(within(group).getByRole('radio', { name: 'Prefiero no informar' }));
  await goTo(4);
  expect(screen.queryByText(/Ley 25.326/)).not.toBeInTheDocument();
  authorizeRequiredConsents(); await goTo(5);
  const legal = screen.getByRole('region', { name: 'Declaración jurada y protección de datos' });
  const lines = new Set(source.consents.flatMap(consent => consent.text.split('\n')).filter(line => line.trim()));
  const displayedLines = [...legal.querySelectorAll('p')].flatMap(paragraph => paragraph.textContent!.split('\n'));
  for (const line of lines) expect(displayedLines.filter(displayed => displayed === line)).toHaveLength(1);
  expect(legal).toHaveTextContent(source.notices!.attendance.replace(/\s+/g, ' '));
  expect(legal).toHaveTextContent(source.notices!.validity);
  expect(legal).toHaveTextContent(source.finalConfirmation);
  expect(legal).toHaveTextContent('Ley 26.529');
  expect(legal).toHaveTextContent('Federico Graziottin');
  expect(legal).toHaveTextContent('+54 9 3464 56-6340');
  expect(legal).toHaveTextContent('Casilda, Santa Fe');
  expect(screen.queryByText(/sha256-|Versión:/)).not.toBeInTheDocument();
});
