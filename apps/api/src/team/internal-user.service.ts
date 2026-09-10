import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
@Injectable()
export class InternalUserService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: { firstName: string; lastName: string; email: string; phone?: string | null; dni?: string | null; address?: string | null; birthDate?: string | null; profession?: string | null; athletaStartDate?: string | null; roles: Role[]; credentialPasswordHash?: string }) {
    if (input.roles.length === 0) throw new ConflictException({ code: 'ACTIVE_USER_REQUIRES_ROLE', message: 'An active user requires at least one role' });
    const uniqueRoles = [...new Set(input.roles)];
    return this.prisma.internalUser.create({ data: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), normalizedEmail: normalizeEmail(input.email), phone: this.optionalText(input.phone), dni: this.optionalText(input.dni), address: this.optionalText(input.address), birthDate: this.optionalDate(input.birthDate), profession: this.optionalText(input.profession), athletaStartDate: this.optionalDate(input.athletaStartDate), roles: { createMany: { data: uniqueRoles.map((role) => ({ role })) } }, ...(input.credentialPasswordHash ? { credential: { create: { passwordHash: input.credentialPasswordHash, mustChangePassword: true } } } : {}) }, include: { roles: true } });
  }
  async find(id: string) { const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } }); if (!user) throw new NotFoundException({ code: 'INTERNAL_USER_NOT_FOUND', message: 'Internal user not found' }); return user; }
  async list() { return this.prisma.internalUser.findMany({ include: { roles: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }); }
  async updateProfile(id: string, input: { firstName?: string; lastName?: string; email?: string; phone?: string | null; dni?: string | null; address?: string | null; birthDate?: string | null; profession?: string | null; athletaStartDate?: string | null }) { await this.find(id); try { return await this.prisma.internalUser.update({ where: { id }, data: { ...(input.firstName !== undefined && { firstName: input.firstName.trim() }), ...(input.lastName !== undefined && { lastName: input.lastName.trim() }), ...(input.email !== undefined && { email: input.email.trim(), normalizedEmail: normalizeEmail(input.email) }), ...(input.phone !== undefined && { phone: this.optionalText(input.phone) }), ...(input.dni !== undefined && { dni: this.optionalText(input.dni) }), ...(input.address !== undefined && { address: this.optionalText(input.address) }), ...(input.birthDate !== undefined && { birthDate: this.optionalDate(input.birthDate) }), ...(input.profession !== undefined && { profession: this.optionalText(input.profession) }), ...(input.athletaStartDate !== undefined && { athletaStartDate: this.optionalDate(input.athletaStartDate) }) }, include: { roles: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'INTERNAL_USER_EMAIL_EXISTS', message: 'An internal user with this email already exists' }); throw error; } }
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
  private optionalText(value: string | null | undefined): string | null { return value?.trim() || null; }
  private optionalDate(value: string | null | undefined): Date | null { return value ? new Date(`${value}T00:00:00.000Z`) : null; }
}
