import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInternalSession, internalLogout } from '@athleta/api-client';
import { logout } from './auth';

vi.mock('@athleta/api-client', () => ({
  internalLogout: vi.fn(),
  internalLogin: vi.fn(),
  getInternalSession: vi.fn(),
  changeInternalPassword: vi.fn(),
}));

describe('auth HTTP boundary', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not treat a rejected logout response as a successful mutation', async () => {
    vi.mocked(internalLogout).mockResolvedValue({ status: 401, data: undefined, headers: new Headers() } as never);
    await expect(logout('csrf-token')).rejects.toThrow('Authentication request failed');
    expect(getInternalSession).not.toHaveBeenCalled();
  });

  const csrfRejected = () => ({ status: 401, data: { code: 'CSRF_INVALID' }, headers: new Headers() }) as never;
  const refreshedSession = (csrfToken: string) => ({ status: 200, data: { data: { user: { id: 'synthetic', firstName: 'Test', lastName: 'User', email: 'auth@athleta.test' }, roles: [], permissions: [], mustChangePassword: false, csrfToken } }, headers: new Headers() }) as never;

  it('refreshes a stale CSRF token once when another tab replaced the session cookie', async () => {
    vi.mocked(internalLogout).mockResolvedValueOnce(csrfRejected()).mockResolvedValueOnce({ status: 200, data: {}, headers: new Headers() } as never);
    vi.mocked(getInternalSession).mockResolvedValue(refreshedSession('current-csrf'));
    await expect(logout('cached-csrf')).resolves.toBeUndefined();
    expect(getInternalSession).toHaveBeenCalledOnce();
    expect(internalLogout).toHaveBeenCalledTimes(2);
    expect(internalLogout).toHaveBeenNthCalledWith(1, { credentials: 'include', headers: { 'x-csrf-token': 'cached-csrf' } });
    expect(internalLogout).toHaveBeenNthCalledWith(2, { credentials: 'include', headers: { 'x-csrf-token': 'current-csrf' } });
  });

  it('retains a CSRF rejection when the session token has not changed', async () => {
    vi.mocked(internalLogout).mockResolvedValue(csrfRejected());
    vi.mocked(getInternalSession).mockResolvedValue(refreshedSession('cached-csrf'));
    await expect(logout('cached-csrf')).rejects.toThrow('Authentication request failed');
    expect(getInternalSession).toHaveBeenCalledOnce();
    expect(internalLogout).toHaveBeenCalledOnce();
  });

  it('does not retry logout after the refreshed session is unauthenticated', async () => {
    vi.mocked(internalLogout).mockResolvedValue(csrfRejected());
    vi.mocked(getInternalSession).mockResolvedValue({ status: 401, data: {}, headers: new Headers() } as never);
    await expect(logout('cached-csrf')).rejects.toThrow('Authentication request failed');
    expect(getInternalSession).toHaveBeenCalledOnce();
    expect(internalLogout).toHaveBeenCalledOnce();
  });

  it('does not loop or hide a second CSRF rejection', async () => {
    vi.mocked(internalLogout).mockResolvedValue(csrfRejected());
    vi.mocked(getInternalSession).mockResolvedValue(refreshedSession('current-csrf'));
    await expect(logout('cached-csrf')).rejects.toThrow('Authentication request failed');
    expect(getInternalSession).toHaveBeenCalledOnce();
    expect(internalLogout).toHaveBeenCalledTimes(2);
  });
});
