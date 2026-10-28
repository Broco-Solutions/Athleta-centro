import { resetPortalPin } from '@athleta/api-client';
import { resetPersonPortalPin } from './people-api';

vi.mock('@athleta/api-client', () => ({ resetPortalPin: vi.fn(), createPerson: vi.fn(), getPerson: vi.fn(), listPeople: vi.fn(), updatePerson: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it('unwraps the existing one-time string envelope and sends internal CSRF', async () => {
  vi.mocked(resetPortalPin).mockResolvedValue({ status: 201, data: { data: '0000' }, headers: new Headers() } as never);
  expect(await resetPersonPortalPin('synthetic-person', 'internal-csrf')).toBe('0000');
  expect(resetPortalPin).toHaveBeenCalledWith('synthetic-person', { credentials: 'include', headers: { 'x-csrf-token': 'internal-csrf' } });
});
it.each([401, 403, 404, 429, 500])('reports an unsuccessful PIN reset (%s) without treating it as a credential', async status => {
  vi.mocked(resetPortalPin).mockResolvedValue({ status, data: { code: 'DENIED' }, headers: new Headers() } as never);
  await expect(resetPersonPortalPin('synthetic-person', 'internal-csrf')).rejects.toThrow();
});
it('rejects an invalid response instead of displaying an object or repeating the reset', async () => {
  vi.mocked(resetPortalPin).mockResolvedValue({ status: 201, data: { data: {} }, headers: new Headers() } as never);
  await expect(resetPersonPortalPin('synthetic-person', 'internal-csrf')).rejects.toThrow('No pudimos mostrar el PIN temporal.');
  expect(resetPortalPin).toHaveBeenCalledTimes(1);
});
it('provides a recoverable Spanish error for a network failure', async () => {
  vi.mocked(resetPortalPin).mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(resetPersonPortalPin('synthetic-person', 'internal-csrf')).rejects.toThrow('Revisá tu conexión');
});
