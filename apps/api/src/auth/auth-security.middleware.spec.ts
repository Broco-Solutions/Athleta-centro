import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthSecurityMiddleware } from './auth-security.middleware';
import type { AuthService } from './auth.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';

describe('logout security', () => {
  const current = jest.fn();
  const middleware = new AuthSecurityMiddleware({ current } as unknown as AuthService, { assertGeneralLimit: jest.fn() } as unknown as AuthRateLimitService);
  const request = (path: string, origin = process.env.WEB_ORIGIN, csrf = 'csrf') => ({ originalUrl: path, method: 'POST', cookies: { athleta_session: 'synthetic' }, header: (key: string) => key === 'origin' ? origin : csrf }) as unknown as Request;
  beforeEach(() => current.mockReset());
  it('allows expired logout to reach revocation and cookie clearing', async () => {
    current.mockRejectedValue(new UnauthorizedException({ code: 'UNAUTHENTICATED' }));
    const next = jest.fn();
    await middleware.use(request('/api/auth/logout'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
  it('continues rejecting expired sessions for other mutations', async () => {
    current.mockRejectedValue(new UnauthorizedException({ code: 'UNAUTHENTICATED' }));
    const next = jest.fn();
    await middleware.use(request('/api/people/test/reset-portal-pin'), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedException);
  });
  it.each(['active', 'expired'])('rejects a foreign origin for %s logout', async state => {
    if (state === 'expired') current.mockRejectedValue(new UnauthorizedException({ code: 'UNAUTHENTICATED' }));
    else current.mockResolvedValue({ session: {}, csrfToken: 'csrf' });
    const next = jest.fn();
    await middleware.use(request('/api/auth/logout', 'https://foreign.example'), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedException);
  });
  it('retains CSRF validation for an active logout', async () => {
    current.mockResolvedValue({ session: {}, csrfToken: 'csrf' });
    const next = jest.fn();
    await middleware.use(request('/api/auth/logout', process.env.WEB_ORIGIN, 'wrong'), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedException);
  });
  it.each(['/api/auth/logout', '/api/people/test/reset-portal-pin'])('accepts the configured origin with a trailing slash for %s', async path => {
    const previous = process.env.WEB_ORIGIN;
    try {
      process.env.WEB_ORIGIN = 'https://athleta.example/';
      current.mockResolvedValue({ session: {}, csrfToken: 'csrf' });
      const next = jest.fn();
      await middleware.use(request(path, 'https://athleta.example'), {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    } finally { process.env.WEB_ORIGIN = previous; }
  });
});
