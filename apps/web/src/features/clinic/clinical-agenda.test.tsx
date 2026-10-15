import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { ClinicalAgenda } from './clinical-agenda';
import NewClinicalAppointmentPage from '../../app/clinic/appointments/new/page';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));
vi.mock('../auth/workspace-shell', () => ({ WorkspaceShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
const appointment = {
  id: '10000000-0000-4000-8000-000000000001',
  personId: '20000000-0000-4000-8000-000000000001',
  professionalId: '30000000-0000-4000-8000-000000000001',
  startAt: '2026-09-15T13:00:00.000Z',
  durationMinutes: 60,
  status: 'SCHEDULED' as const,
  operationalNote: null,
  person: { id: '20000000-0000-4000-8000-000000000001', firstName: 'Ana', lastName: 'Sintética', dni: '45000001' },
  professional: { id: '30000000-0000-4000-8000-000000000001', firstName: 'Pablo', lastName: 'Clínico', roles: ['KINESIOLOGIST' as const] },
  hasAttention: false,
  hasEvolution: false,
  coverage: null,
  overlapCount: 0,
};

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(
    typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input,
    init,
  )) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T13:30:00.000Z'));
});
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderAgenda(props: { canManage?: boolean; personId?: string } = {}): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClinicalAgenda csrfToken="csrf" canManage {...props} />
    </QueryClientProvider>,
  );
}

function baseHandlers(): void {
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [appointment] })),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [appointment.professional] })),
  );
}

it('requires explicit coverage before correcting a Turno to Atendido', async () => {
  let submitted: unknown;
  baseHandlers();
  server.use(http.post('http://localhost:3000/api/clinic/appointments/:id/correct', async ({ request }) => {
    submitted = await request.json();
    return HttpResponse.json({ data: { ...appointment, status: 'ATTENDED', hasAttention: true, coverage: 'PRIVATE' } }, { status: 201 });
  }));
  renderAgenda();

  fireEvent.change(await screen.findByLabelText('Nuevo estado de Ana Sintética'), { target: { value: 'ATTENDED' } });
  const apply = screen.getByRole('button', { name: 'Aplicar estado' });
  expect(apply).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Cobertura de Ana Sintética'), { target: { value: 'PRIVATE' } });
  expect(apply).toBeEnabled();
  fireEvent.click(apply);

  await waitFor(() => expect(submitted).toEqual({ status: 'ATTENDED', coverage: 'PRIVATE' }));
  expect(await screen.findByText(/La Atención quedó sin Evolución/)).toBeInTheDocument();
});

it('requests the Buenos Aires weekly range and the past-pending filter', async () => {
  const searches: string[] = [];
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', ({ request }) => {
      searches.push(decodeURIComponent(new URL(request.url).search));
      return HttpResponse.json({ data: [] });
    }),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [] })),
  );
  renderAgenda();
  fireEvent.change(screen.getByLabelText('Fecha de agenda'), { target: { value: '2026-09-16' } });
  fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
  await waitFor(() => expect(searches.some((search) => search.includes('from=2026-09-14T03:00:00.000Z') && search.includes('to=2026-09-21T03:00:00.000Z'))).toBe(true));

  fireEvent.click(screen.getByRole('button', { name: 'Pendientes pasados' }));
  await waitFor(() => expect(searches.some((search) => search.includes('pendingPastScheduled=YES'))).toBe(true));
});

it('shows the stable dependency conflict without exposing a payload', async () => {
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [{
      ...appointment,
      status: 'ATTENDED',
      hasAttention: true,
      coverage: 'PRIVATE',
    }] })),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [appointment.professional] })),
    http.post('http://localhost:3000/api/clinic/appointments/:id/correct', () => HttpResponse.json({
      statusCode: 409,
      code: 'ATTENTION_HAS_DEPENDENCIES',
      message: 'internal detail',
    }, { status: 409 })),
  );
  renderAgenda();

  fireEvent.change(await screen.findByLabelText('Nuevo estado de Ana Sintética'), { target: { value: 'CANCELLED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar estado' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('La Atención posee contenido o dependencias.');
  expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
});


it.each([undefined, appointment.personId])('links Nuevo turno to the existing form with patient %s', async (personId) => {
  baseHandlers();
  renderAgenda(personId ? { personId } : {});
  expect(screen.getByRole('link', { name: 'Nuevo turno' })).toHaveAttribute('href',
    personId ? `/clinic/appointments/new?personId=${personId}` : '/clinic/appointments/new');
  expect(await screen.findByRole('link', { name: 'Abrir ficha' })).toHaveAttribute('href',
    `/clinic?tab=Paciente&personId=${appointment.personId}`);
});

it.each([true, false])('sends and clears the professional filter with canManage=%s', async (canManage) => {
  const searches: URLSearchParams[] = [];
  baseHandlers();
  server.use(http.get('http://localhost:3000/api/clinic/appointments', ({ request }) => {
    const search = new URL(request.url).searchParams;
    searches.push(search);
    return HttpResponse.json({ data: search.has('professionalId') ? [] : [appointment] });
  }));
  renderAgenda({ canManage, personId: appointment.personId });
  expect(screen.queryByRole('link', { name: 'Nuevo turno' }) !== null).toBe(canManage);
  const filter = screen.getByRole('combobox', { name: 'Profesional' });
  expect(filter).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Todos los profesionales' })).toBeInTheDocument();
  await screen.findByRole('option', { name: 'Pablo Clínico' });
  await screen.findByRole('link', { name: 'Abrir ficha' });
  fireEvent.change(filter, { target: { value: appointment.professionalId } });
  await waitFor(() => expect(searches.at(-1)?.get('professionalId')).toBe(appointment.professionalId));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Abrir ficha' })).not.toBeInTheDocument());
  expect(searches.at(-1)?.get('personId')).toBe(appointment.personId);

  fireEvent.change(screen.getByLabelText('Fecha de agenda'), { target: { value: '2026-09-16' } });
  await waitFor(() => expect(searches.at(-1)?.get('from')).toBe('2026-09-16T03:00:00.000Z'));
  expect(searches.at(-1)?.get('professionalId')).toBe(appointment.professionalId);
  fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
  await waitFor(() => expect(searches.at(-1)?.get('from')).toBe('2026-09-14T03:00:00.000Z'));
  expect(searches.at(-1)?.get('to')).toBe('2026-09-21T03:00:00.000Z');
  expect(searches.at(-1)?.get('professionalId')).toBe(appointment.professionalId);
  expect(screen.getAllByRole('region', { name: /^Turnos del/ })).toHaveLength(7);
  fireEvent.click(screen.getByRole('button', { name: 'Día' }));
  await waitFor(() => expect(searches.at(-1)?.get('from')).toBe('2026-09-16T03:00:00.000Z'));
  expect(filter).toHaveValue(appointment.professionalId);

  fireEvent.click(screen.getByRole('button', { name: 'Pendientes pasados' }));
  await waitFor(() => expect(searches.at(-1)?.get('pendingPastScheduled')).toBe('YES'));
  expect(searches.at(-1)?.get('professionalId')).toBe(appointment.professionalId);
  expect(searches.at(-1)?.get('personId')).toBe(appointment.personId);
  expect(searches.at(-1)?.has('from')).toBe(false);
  fireEvent.change(filter, { target: { value: '' } });
  await screen.findByRole('link', { name: 'Abrir ficha' });
  expect(searches.at(-1)?.has('professionalId')).toBe(false);
  expect(searches.at(-1)?.get('pendingPastScheduled')).toBe('YES');
  expect(searches.at(-1)?.get('personId')).toBe(appointment.personId);
});

it('keeps the agenda available without invented options when professionals fail', async () => {
  baseHandlers();
  server.use(http.get('http://localhost:3000/api/clinic/professionals', () => new HttpResponse(null, { status: 500 })));
  renderAgenda({ canManage: false });
  expect(await screen.findByText(/La agenda sigue disponible sin filtro/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Profesional' })).toBeDisabled();
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(await screen.findByRole('link', { name: 'Abrir ficha' })).toBeInTheDocument();
});

it.each([
  ['2026-09-15T12:59:59.999Z', 'Próximo', false],
  ['2026-09-15T13:00:00.000Z', 'En curso', false],
  ['2026-09-15T13:00:00.001Z', 'En curso', true],
  ['2026-09-15T13:59:59.999Z', 'En curso', true],
  ['2026-09-15T14:00:00.000Z', 'Pasado', true],
  ['2026-09-15T14:00:00.001Z', 'Pasado', true],
])('identifies the appointment time at %s as %s without changing its status', async (now, label, pending) => {
  vi.setSystemTime(new Date(now));
  baseHandlers();
  renderAgenda({ canManage: false });
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.getByText('Agendado', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText(/Agendado pasado: requiere actualización manual/) !== null).toBe(pending);
});

it('opens each patient record from its own appointment card', async () => {
  baseHandlers();
  const otherPersonId = '20000000-0000-4000-8000-000000000002';
  server.use(http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [
    appointment,
    { ...appointment, id: '10000000-0000-4000-8000-000000000002', personId: otherPersonId,
      person: { ...appointment.person, id: otherPersonId, firstName: 'Otra' }, startAt: '2026-09-15T15:00:00.000Z' },
  ] })));
  renderAgenda({ canManage: false });
  await screen.findByText('Otra Sintética');
  const cards = screen.getAllByRole('article');
  expect(within(cards[0]!).getByRole('link', { name: 'Abrir ficha' })).toHaveAttribute('href', `/clinic?tab=Paciente&personId=${appointment.personId}`);
  expect(within(cards[1]!).getByRole('link', { name: 'Abrir ficha' })).toHaveAttribute('href', `/clinic?tab=Paciente&personId=${otherPersonId}`);
});

it('reschedules with the existing payload and reports overlaps without blocking', async () => {
  let submitted: unknown;
  baseHandlers();
  server.use(http.post('http://localhost:3000/api/clinic/appointments/:id/reschedule', async ({ request }) => {
    submitted = await request.json();
    return HttpResponse.json({ data: { ...appointment, overlapCount: 2 } }, { status: 201 });
  }));
  renderAgenda();
  fireEvent.click(await screen.findByRole('button', { name: 'Reprogramar Turno' }));
  fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: '2026-09-16T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reprogramación' }));
  await waitFor(() => expect(submitted).toEqual({ professionalId: appointment.professionalId, startAt: '2026-09-16T13:00:00.000Z', durationMinutes: 60 }));
  expect(await screen.findByText('Turno reprogramado. Coincide con 2 Turno(s) del profesional.')).toBeInTheDocument();
});

it.each([
  ['CONCURRENT_MODIFICATION', 'El Turno cambió mientras lo estabas editando.'],
  ['UNKNOWN_ERROR', 'No pudimos actualizar el Turno.'],
])('keeps the existing status error for %s', async (code, message) => {
  baseHandlers();
  server.use(http.post('http://localhost:3000/api/clinic/appointments/:id/correct', () => HttpResponse.json({ code, message: 'internal detail' }, { status: 409 })));
  renderAgenda();
  fireEvent.change(await screen.findByLabelText('Nuevo estado de Ana Sintética'), { target: { value: 'CANCELLED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar estado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
});


it.each(['', `personId=${appointment.personId}`])('returns from appointment creation to the explicit Agenda tab (%s)', async (search) => {
  navigation.search = search;
  baseHandlers();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.get('http://localhost:3000/api/clinic/patients', () => HttpResponse.json({ data: [appointment.person] })),
    http.post('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: appointment }, { status: 201 })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NewClinicalAppointmentPage /></QueryClientProvider>);
  expect(screen.getByRole('link', { name: 'Clínica' })).toHaveAttribute('href', search ? `/clinic?tab=Agenda&personId=${appointment.personId}` : '/clinic?tab=Agenda');
  await screen.findByRole('option', { name: /Sintética, Ana/ });
  await screen.findByRole('option', { name: /Clínico, Pablo/ });
  fireEvent.change(screen.getByLabelText('Paciente'), { target: { value: appointment.personId } });
  fireEvent.change(screen.getByLabelText('Profesional clínico'), { target: { value: appointment.professionalId } });
  fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: '2026-09-16T10:00' } });
  expect(screen.getByLabelText('Duración en minutos')).toHaveValue(60);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Turno' }));
  expect(await screen.findByRole('link', { name: 'Volver a la agenda' })).toHaveAttribute('href', `/clinic?tab=Agenda&personId=${appointment.personId}`);
  expect(screen.getByText('Turno guardado correctamente.')).toBeInTheDocument();
});
