import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getPersonHealthDeclaration, getPersonHealthDeclarationStatus, listPersonHealthDeclarations } from '@athleta/api-client';
import { HealthDeclarationPanel } from './health-panel';
vi.mock('@athleta/api-client', () => ({ getPersonHealthDeclaration: vi.fn(), getPersonHealthDeclarationStatus: vi.fn(), listPersonHealthDeclarations: vi.fn() }));
const submission = { id: 'synthetic-declaration', submittedAt: '2026-10-22T15:00:00.000Z', validUntil: '2027-10-22T15:00:00.000Z', documentVersion: 'TEST-ONLY' };
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
