import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthSecurityMiddleware } from './auth-security.middleware';
import type { AuthService } from './auth.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';

describe('logout security', () => {
  const current = jest.fn();
  const middleware = new AuthSecurityMiddleware({ current } as unknown as AuthService, { assertGeneralLimit: jest.fn() } as unknown as AuthRateLimitService);
  const request = (path: string, origin = process.env.WEB_ORIGIN, csrf = 'csrf', method = 'POST') => ({ originalUrl: path, method, ip: '127.0.0.1', cookies: { athleta_session: 'synthetic' }, header: (key: string) => key === 'origin' ? origin : csrf }) as unknown as Request;
  beforeEach(() => {
    current.mockReset();
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    process.env.WEB_ORIGIN = 'https://athleta.example';
  });
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

describe('Clinic availability security', () => {
  const current = jest.fn();
  const middleware = new AuthSecurityMiddleware({ current } as unknown as AuthService, { assertGeneralLimit: jest.fn() } as unknown as AuthRateLimitService);
  const request = (path: string, method: string, origin = 'https://athleta.example', csrf = 'csrf') => ({ originalUrl: path, method, ip: '127.0.0.1', cookies: { athleta_session: 'synthetic' }, header: (key: string) => key === 'origin' ? origin : csrf }) as unknown as Request;
  beforeEach(() => {
    current.mockReset();
    current.mockResolvedValue({ session: {}, csrfToken: 'csrf' });
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    process.env.WEB_ORIGIN = 'https://athleta.example';
  });

  it.each(['GET', 'POST'])('allows %s /api/clinic/social-works while Clinic is disabled', async method => {
    const next = jest.fn();
    await middleware.use(request('/api/clinic/social-works', method), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['/api/clinic/social-works/123', 'GET'],
    ['/api/clinic/appointments', 'GET'],
    ['/api/clinic/social-works', 'PATCH'],
  ])('keeps %s (%s) unavailable while Clinic is disabled', async (path, method) => {
    const next = jest.fn();
    await middleware.use(request(path, method), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ response: expect.objectContaining({ code: 'CLINIC_UNAVAILABLE' }) }));
  });

  it('still rejects catalog POST with an invalid CSRF token', async () => {
    const next = jest.fn();
    await middleware.use(request('/api/clinic/social-works', 'POST', 'https://athleta.example', 'wrong'), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedException);
  });

  it('still rejects catalog POST from an unauthorized origin', async () => {
    const next = jest.fn();
    await middleware.use(request('/api/clinic/social-works', 'POST', 'https://foreign.example'), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedException);
  });

  it.each(['GET', 'POST'])('continues allowing the catalog %s when Clinic is enabled', async method => {
    process.env.ATHLETA_CLINIC_ENABLED = 'true';
    const next = jest.fn();
    await middleware.use(request('/api/clinic/social-works', method), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('keeps other Clinic routes available when Clinic is enabled', async () => {
    process.env.ATHLETA_CLINIC_ENABLED = 'true';
    const next = jest.fn();
    await middleware.use(request('/api/clinic/appointments', 'GET'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
