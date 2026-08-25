import { beforeEach, describe, expect, it, vi } from 'vitest';
import { internalLogout } from '@athleta/api-client';
import { logout } from './auth';

vi.mock('@athleta/api-client', () => ({
  internalLogout: vi.fn(),
  internalLogin: vi.fn(),
  getInternalSession: vi.fn(),
  changeInternalPassword: vi.fn(),
}));

describe('auth HTTP boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not treat a rejected logout response as a successful mutation', async () => {
    vi.mocked(internalLogout).mockResolvedValue({ status: 401, data: undefined, headers: new Headers() } as never);
    await expect(logout('csrf-token')).rejects.toThrow('Authentication request failed');
  });
});
