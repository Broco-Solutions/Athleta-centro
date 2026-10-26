import type { NextFunction, Request, Response } from 'express';
import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { configuredWebOrigin, isClinicEnabled } from '../config/env';

@Injectable()
export class AuthSecurityMiddleware {
  constructor(private readonly auth: AuthService, private readonly rateLimits: AuthRateLimitService) {}
  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    const path = request.originalUrl.split('?')[0] ?? request.path;
    const bypassInternalSecurity =
      path === '/api/auth/login' ||
      path.startsWith('/api/portal/') ||
      path === '/health';
    const allowedWhilePasswordChangeRequired = path === '/api/auth/session' || path === '/api/auth/change-password' || path === '/api/auth/logout';
    if (path.startsWith('/api/')) this.rateLimits.assertGeneralLimit(request.ip ?? 'unknown');
    const clinicalPath = ['/api/clinic', '/api/portal/clinic', '/api/finance/clinical-incomes'].some((base) => path === base || path.startsWith(`${base}/`));
    if (!isClinicEnabled() && clinicalPath) return next(new NotFoundException({ code: 'CLINIC_UNAVAILABLE', message: 'Not found' }));
    if (bypassInternalSecurity || !request.cookies?.athleta_session) return next();
    try {
      const current = await this.auth.current(request.cookies.athleta_session);
      if (current.session.mustChangePassword && !allowedWhilePasswordChangeRequired) {
        throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.header('origin');
        if (origin && origin !== configuredWebOrigin()) {
          throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' });
        }
        if (request.header('x-csrf-token') !== current.csrfToken) {
          throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' });
        }
      }
      next();
    } catch (error) {
      // An expired/revoked cookie must still reach logout so it can be cleared.
      // Active sessions continue through the normal Origin + CSRF checks above.
      const response = error instanceof UnauthorizedException ? error.getResponse() : null;
      const unauthenticated = response && typeof response === 'object' && 'code' in response && response.code === 'UNAUTHENTICATED';
      if (path === '/api/auth/logout' && request.method === 'POST' && unauthenticated) {
        const origin = request.header('origin');
        if (origin && origin !== configuredWebOrigin()) return next(new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' }));
        return next();
      }
      next(error);
    }
  }
}
