import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getPersonHealthDeclaration, getPersonHealthDeclarationStatus, listPersonHealthDeclarations, registerPaperHealthDeclaration } from '@athleta/api-client';
import { HealthDeclarationPanel } from './health-panel';
vi.mock('@athleta/api-client', () => ({ getPersonHealthDeclaration: vi.fn(), getPersonHealthDeclarationStatus: vi.fn(), listPersonHealthDeclarations: vi.fn(), registerPaperHealthDeclaration: vi.fn() }));
const submission = { origin: 'DIGITAL' as const, id: 'synthetic-declaration', submittedAt: '2026-10-22T15:00:00.000Z', validUntil: '2027-10-22T15:00:00.000Z', documentVersion: 'TEST-ONLY' };
beforeEach(() => {
  vi.mocked(getPersonHealthDeclarationStatus).mockResolvedValue({ status: 200, data: { data: { status: 'CURRENT', required: false, documentAvailable: true, latest: submission } }, headers: new Headers() });
  vi.mocked(listPersonHealthDeclarations).mockResolvedValue({ status: 200, data: { data: [submission] }, headers: new Headers() });
});
afterEach(() => vi.clearAllMocks());
function view(canReadAnswers: boolean) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HealthDeclarationPanel personId="synthetic-person" canReadAnswers={canReadAnswers} /></QueryClientProvider>); }
it('shows only status and dates to an administrative reader without fetching sensitive answers', async () => {
  view(false);
  expect(await screen.findByText('Vigente', { exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Consultar declaración/ })).not.toBeInTheDocument();
  expect(getPersonHealthDeclaration).not.toHaveBeenCalled();
});
it('fetches an authorized read-only declaration only after the user requests it', async () => {
  vi.mocked(getPersonHealthDeclaration).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { ...submission, identity: { firstName: 'Alumno sintético', confirmed: true }, personal: { emergencyContactName: 'Contacto sintético', emergencyContactPhone: '0000000000' }, activity: {}, kinesiology: {}, answers: {}, consents: { physicalActivity: true, truthfulness: true, emergenciesAndPrivacy: true, shareWithDoctors: false, shareWithClubs: false, clinicalImage: false, institutionalImage: false }, document: {} } } });
  view(true);
  const button = await screen.findByRole('button', { name: /Consultar declaración/ });
  expect(getPersonHealthDeclaration).not.toHaveBeenCalled(); fireEvent.click(button);
  expect(await screen.findByText('Contacto sintético', { exact: true })).toBeVisible();
  await waitFor(() => expect(getPersonHealthDeclaration).toHaveBeenCalledWith('synthetic-person', submission.id, { credentials: 'include' }));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('hides technical fingerprints from administrative history and confirmed copies', async () => {
  vi.mocked(getPersonHealthDeclaration).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { ...submission, identity: { firstName: 'Alumno sintético', confirmed: true }, personal: { emergencyContactName: 'Contacto sintético', emergencyContactPhone: '0000000000' }, activity: {}, kinesiology: {}, answers: {}, consents: { physicalActivity: true, truthfulness: true, emergenciesAndPrivacy: true, shareWithDoctors: false, shareWithClubs: false, clinicalImage: false, institutionalImage: false }, document: { version: 'hidden-version', sourceSha256: 'hidden-hash' } } } });
  view(true);
  fireEvent.click(await screen.findByRole('button', { name: /Consultar declaración/ }));
  expect(await screen.findByText('Contacto sintético', { exact: true })).toBeVisible();
  expect(screen.queryByText(/TEST-ONLY|hidden-version|hidden-hash|Versión/)).not.toBeInTheDocument();
});

it('shows paper evidence and its registrar without offering digital answers or printing', async () => {
  const paper = { ...submission, origin: 'PAPER' as const, registeredAt: '2026-10-23T12:00:00Z', registeredByName: 'Personal sintético' };
  vi.mocked(getPersonHealthDeclarationStatus).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { status: 'CURRENT', required: false, documentAvailable: true, latest: paper } } });
  vi.mocked(listPersonHealthDeclarations).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: [paper] } });
  view(true);
  expect(await screen.findByText(/Personal sintético/)).toBeVisible();
  expect(screen.getAllByText(/Declaración presentada en papel/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /Consultar|Imprimir|Registrar/ })).not.toBeInTheDocument();
  expect(getPersonHealthDeclaration).not.toHaveBeenCalled();
});
it('registers paper evidence with participation permission and refreshes status and history', async () => {
  vi.mocked(getPersonHealthDeclarationStatus).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { status: 'MISSING', required: true, documentAvailable: true, latest: null } } });
  vi.mocked(listPersonHealthDeclarations).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: [] } });
  vi.mocked(registerPaperHealthDeclaration).mockResolvedValue({ status: 201, headers: new Headers(), data: { data: { status: 'CURRENT', required: false, documentAvailable: true, latest: submission } } });
  render(<QueryClientProvider client={new QueryClient()}><HealthDeclarationPanel personId="synthetic-person" canReadAnswers={false} canRegisterPaper csrfToken="csrf" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar declaración presentada en papel' }));
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByLabelText('Fecha de firma')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Fecha de firma'), { target: { value: '2026-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
  await waitFor(() => expect(registerPaperHealthDeclaration).toHaveBeenCalledWith('synthetic-person', { signedOn: '2026-01-01' }, { credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
  await waitFor(() => expect(listPersonHealthDeclarations).toHaveBeenCalledTimes(2));
});
