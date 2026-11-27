import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { Permission } from '../team/permissions';

const PERMISSIONS_KEY = 'athleta.permissions';
const ANY_PERMISSIONS_KEY = 'athleta.any-permissions';
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireAnyPermission = (...permissions: Permission[]): MethodDecorator => SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export type InternalActor = { id: string; roles: readonly Role[] };

type AuthenticatedRequest = Request & {
  athletaUserId?: string;
  athletaPermissions?: readonly Permission[];
  athletaActor: InternalActor;
};

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): InternalActor =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().athletaActor);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const anyRequired = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const current = await this.auth.current(request.cookies?.athleta_session);
    request.athletaActor = { id: current.session.user.id, roles: current.session.roles };
    request.athletaUserId = current.session.user.id;
    request.athletaPermissions = current.session.permissions;
    if (!required.every((permission) => current.session.permissions.includes(permission))) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' });
    }
    if (anyRequired.length > 0 && !anyRequired.some((permission) => current.session.permissions.includes(permission))) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' });
    return true;
  }
}
