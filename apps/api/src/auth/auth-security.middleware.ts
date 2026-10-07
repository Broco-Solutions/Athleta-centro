import type { NextFunction, Request, Response } from 'express';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRateLimitService } from './auth-rate-limit.service';

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
    if (bypassInternalSecurity || !request.cookies?.athleta_session) return next();
    try {
      const current = await this.auth.current(request.cookies.athleta_session);
      if (current.session.mustChangePassword && !allowedWhilePasswordChangeRequired) {
        throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.header('origin');
        if (origin && origin !== process.env.WEB_ORIGIN) {
          throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' });
        }
        if (request.header('x-csrf-token') !== current.csrfToken) {
          throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' });
        }
      }
      next();
    } catch (error) { next(error); }
  }
}
