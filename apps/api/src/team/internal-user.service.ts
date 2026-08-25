import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
@Injectable()
export class InternalUserService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: { firstName: string; lastName: string; email: string; roles: Role[]; credentialPasswordHash?: string }) {
    if (input.roles.length === 0) throw new ConflictException({ code: 'ACTIVE_USER_REQUIRES_ROLE', message: 'An active user requires at least one role' });
    const uniqueRoles = [...new Set(input.roles)];
    return this.prisma.internalUser.create({ data: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), normalizedEmail: normalizeEmail(input.email), roles: { createMany: { data: uniqueRoles.map((role) => ({ role })) } }, ...(input.credentialPasswordHash ? { credential: { create: { passwordHash: input.credentialPasswordHash, mustChangePassword: true } } } : {}) }, include: { roles: true } });
  }
  async find(id: string) { const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } }); if (!user) throw new NotFoundException({ code: 'INTERNAL_USER_NOT_FOUND', message: 'Internal user not found' }); return user; }
  async list() { return this.prisma.internalUser.findMany({ include: { roles: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }); }
  async updateProfile(id: string, input: { firstName?: string; lastName?: string; email?: string }) { await this.find(id); try { return await this.prisma.internalUser.update({ where: { id }, data: { ...(input.firstName !== undefined && { firstName: input.firstName.trim() }), ...(input.lastName !== undefined && { lastName: input.lastName.trim() }), ...(input.email !== undefined && { email: input.email.trim(), normalizedEmail: normalizeEmail(input.email) }) }, include: { roles: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'INTERNAL_USER_EMAIL_EXISTS', message: 'An internal user with this email already exists' }); throw error; } }
  async addRole(id: string, role: Role) { await this.find(id); try { await this.prisma.internalUserRole.create({ data: { internalUserId: id, role } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'ROLE_ALREADY_ASSIGNED', message: 'Role is already assigned' }); throw error; } return this.find(id); }
  async removeRole(id: string, role: Role) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.internalUser.findUnique({ where: { id }, include: { roles: true } });
      if (!user) throw new NotFoundException({ code: 'INTERNAL_USER_NOT_FOUND', message: 'Internal user not found' });
      if (!user.roles.some((entry) => entry.role === role)) throw new NotFoundException({ code: 'ROLE_NOT_ASSIGNED', message: 'Role is not assigned' });
      if (user.status === 'ACTIVE' && user.roles.length === 1) throw new ConflictException({ code: 'ACTIVE_USER_REQUIRES_ROLE', message: 'An active user requires at least one role' });
      await tx.internalUserRole.delete({ where: { internalUserId_role: { internalUserId: id, role } } });
      return tx.internalUser.findUniqueOrThrow({ where: { id }, include: { roles: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async inactivate(id: string) { return this.prisma.$transaction(async (tx) => { const user = await tx.internalUser.update({ where: { id }, data: { status: 'INACTIVE' }, include: { roles: true } }); await tx.session.updateMany({ where: { internalUserId: id, revokedAt: null }, data: { revokedAt: new Date() } }); return user; }); }
  async reactivate(id: string) {
    const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } });
    if (!user) throw new NotFoundException({ code: 'INTERNAL_USER_NOT_FOUND', message: 'Internal user not found' });
    if (user.roles.length === 0) throw new ConflictException({ code: 'ACTIVE_USER_REQUIRES_ROLE', message: 'An active user requires at least one role' });
    return this.prisma.internalUser.update({ where: { id }, data: { status: InternalUserStatus.ACTIVE }, include: { roles: true } });
  }
}
