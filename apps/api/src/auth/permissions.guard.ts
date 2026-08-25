import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { Permission } from '../team/permissions';

const PERMISSIONS_KEY = 'athleta.permissions';
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const request = context.switchToHttp().getRequest<Request>();
    const current = await this.auth.current(request.cookies?.athleta_session);
    if (!required.every((permission) => current.session.permissions.includes(permission))) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' });
    }
    return true;
  }
}
