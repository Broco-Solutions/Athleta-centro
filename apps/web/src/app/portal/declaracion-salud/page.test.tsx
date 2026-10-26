import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getPortalHealthDeclarationStatus, listPortalHealthDeclarations, getPortalHealthDocument } from '@athleta/api-client';
import HealthDeclarationPage from './page';
vi.mock('@athleta/api-client', () => ({ getPortalHealthDeclarationStatus: vi.fn(), listPortalHealthDeclarations: vi.fn(), getPortalHealthDocument: vi.fn(), getPortalHealthDeclaration: vi.fn(), submitPortalHealthDeclaration: vi.fn() }));
vi.mock('../portal-ui', () => ({ PortalFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, portalFetch: vi.fn(async () => ({ firstName: 'Alumno', lastName: 'Sintético', birthDate: '1990-01-01', dni: '00000001', phone: '0000000000' })) }));
vi.mock('../../../features/health-declaration/health-form', () => ({ HealthForm: () => <form aria-label="Formulario digital de cinco pasos" />, parseHealthDocument: () => null }));
const digital = { id: 'synthetic', origin: 'DIGITAL' as const, submittedAt: '2026-10-23T12:00:00Z', validUntil: '2027-10-23T12:00:00Z', documentVersion: 'synthetic' };
beforeEach(() => {
  vi.mocked(listPortalHealthDeclarations).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: [] } });
  vi.mocked(getPortalHealthDocument).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: null } });
});
afterEach(() => vi.clearAllMocks());
function view() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HealthDeclarationPage /></QueryClientProvider>); }
it.each(['DIGITAL', 'PAPER'] as const)('blocks the form for current %s evidence while preserving read-only history', async origin => {
  const latest = { ...digital, origin };
  vi.mocked(getPortalHealthDeclarationStatus).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { status: 'CURRENT', required: false, documentAvailable: true, latest } } });
  vi.mocked(listPortalHealthDeclarations).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: [latest] } });
  view();
  expect(await screen.findByRole('heading', { name: 'Declaración vigente' })).toBeVisible();
  expect(screen.getByText('Tu declaración de salud se encuentra vigente. Podrás completar una nueva cuando venza la actual.')).toBeVisible();
  expect(screen.getByText(/Si cambió tu estado de salud/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Actualizar|Completar nuevamente/ })).not.toBeInTheDocument();
  expect(getPortalHealthDocument).not.toHaveBeenCalled();
  if (origin === 'PAPER') {
    expect(screen.getByText(/firmada en papel ya fue registrada/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Consultar|Imprimir/ })).not.toBeInTheDocument();
  } else expect(await screen.findByRole('button', { name: /Consultar declaración del/ })).toBeVisible();
});
it.each(['MISSING', 'EXPIRED'] as const)('permits a digital presentation when %s', async status => {
  vi.mocked(getPortalHealthDeclarationStatus).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { status, required: true, documentAvailable: true, latest: status === 'EXPIRED' ? digital : null } } });
  view();
  expect(await screen.findByRole('form', { name: 'Formulario digital de cinco pasos' })).toBeVisible();
  if (status === 'EXPIRED') expect(screen.getByText('Tu declaración de salud venció. Para continuar utilizando el Portal, completá una nueva declaración.')).toBeVisible();
});
it('does not expose the form if the status cannot be checked', async () => {
  vi.mocked(getPortalHealthDeclarationStatus).mockRejectedValue(new Error('Offline'));
  view(); expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el estado');
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});
