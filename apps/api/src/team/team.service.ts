import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import type { Permission } from './permissions';
import { InternalUserService } from './internal-user.service';
import type { CreateTeamUserDto, UpdateTeamUserDto } from './team.dto';
import { PrismaService } from '../prisma/prisma.service';

const isClinicalRole = (role: Role): boolean => role === Role.KINESIOLOGIST || role === Role.OSTEOPATH;

@Injectable()
export class TeamService {
  constructor(private readonly users: InternalUserService, private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  async list() { return (await this.users.list()).map((user) => this.safe(user)); }
  async get(id: string) { return this.safe(await this.users.find(id)); }
  async create(input: CreateTeamUserDto, permissions: readonly string[]) {
    this.authorizeRoles([], input.roles, permissions);
    this.assertProfileDates(input);
    const temporaryPassword = input.dni;
    const passwordHash = await this.auth.hashInitialCredential(temporaryPassword);
    try {
      const user = await this.users.create({ ...input, credentialPasswordHash: passwordHash });
      return { data: this.safe(user), temporaryPassword };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'INTERNAL_USER_EMAIL_EXISTS', message: 'An internal user with this email already exists' });
      }
      throw error;
    }
  }
  async update(id: string, input: UpdateTeamUserDto, actorId: string, permissions: readonly string[]) { const target = await this.users.find(id); if (actorId !== id) this.authorizeRoles(target.roles.map((entry) => entry.role), [], permissions); this.assertProfileDates(input); return this.safe(await this.users.updateProfile(id, input)); }
  async me(actorId: string, roles: readonly Role[]) { this.assertNotBroco(roles); return this.safe(await this.users.find(actorId)); }
  async updateMe(actorId: string, roles: readonly Role[], input: UpdateTeamUserDto) { this.assertNotBroco(roles); this.assertProfileDates(input); return this.safe(await this.users.updateProfile(actorId, input)); }
  async addRole(id: string, role: Role, permissions: readonly string[]) { const target = await this.users.find(id); this.authorizeRoles(target.roles.map((entry) => entry.role), [role], permissions); return this.safe(await this.users.addRole(id, role)); }
  async removeRole(id: string, role: Role, permissions: readonly string[]) { const target = await this.users.find(id); const remainingRoles = target.roles.map((entry) => entry.role).filter((currentRole) => currentRole !== role); this.authorizeRoles(target.roles.map((entry) => entry.role), [role], permissions); await this.assertNoResponsibilities(id, role, remainingRoles); return this.safe(await this.users.removeRole(id, role)); }
  async inactivate(id: string, permissions: readonly string[]) { const target = await this.users.find(id); this.authorizeRoles(target.roles.map((entry) => entry.role), [], permissions); for (const role of target.roles.map((entry) => entry.role)) await this.assertNoResponsibilities(id, role); return this.safe(await this.users.inactivate(id)); }
  async reactivate(id: string, permissions: readonly string[]) { const target = await this.users.find(id); this.authorizeRoles(target.roles.map((entry) => entry.role), [], permissions); return this.safe(await this.users.reactivate(id)); }
  async resetCredential(id: string, permissions: readonly string[]) {
    const target = await this.users.find(id);
    const roles = target.roles.map((entry) => entry.role);
    if (roles.includes(Role.BROCO_SUPPORT)) throw new ForbiddenException({ code: 'SUPPORT_ACCOUNT_NOT_MANAGEABLE', message: 'Support accounts cannot be managed here' });
    const required: Permission = roles.includes(Role.GENERAL_ADMIN) ? 'TEAM_GENERAL_ADMIN_CREDENTIAL_RESET' : 'TEAM_STANDARD_CREDENTIAL_RESET';
    if (!permissions.includes(required)) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' });
    const temporaryPassword = this.temporaryPassword();
    const passwordHash = await this.auth.hashPassword(temporaryPassword);
    await this.prisma.$transaction([
      this.prisma.internalCredential.upsert({ where: { internalUserId: id }, create: { internalUserId: id, passwordHash, mustChangePassword: true }, update: { passwordHash, mustChangePassword: true, credentialsUpdatedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { internalUserId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { temporaryPassword };
  }
  private authorizeRoles(current: Role[], changed: Role[], permissions: readonly string[]): void { const involved = new Set([...current, ...changed]); if (involved.has(Role.BROCO_SUPPORT)) throw new ForbiddenException({ code: 'SUPPORT_ACCOUNT_NOT_MANAGEABLE', message: 'Support accounts cannot be managed here' }); const required: Permission = involved.has(Role.GENERAL_ADMIN) ? 'TEAM_GENERAL_ADMIN_MANAGE' : 'TEAM_STANDARD_USER_MANAGE'; if (!permissions.includes(required)) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' }); }
  private assertNotBroco(roles: readonly Role[]): void { if (roles.includes(Role.BROCO_SUPPORT)) throw new ForbiddenException({ code: 'SUPPORT_ACCOUNT_NOT_MANAGEABLE', message: 'Support accounts cannot be managed here' }); }
  private assertProfileDates(input: Pick<UpdateTeamUserDto, 'birthDate' | 'athletaStartDate'>): void {
    const today = this.argentinaDate();
    if (input.birthDate && input.birthDate > today) throw new BadRequestException({ code: 'INTERNAL_USER_BIRTH_DATE_IN_FUTURE', message: 'Birth date cannot be in the future' });
    if (input.athletaStartDate && input.athletaStartDate > today) throw new BadRequestException({ code: 'INTERNAL_USER_START_DATE_IN_FUTURE', message: 'Athleta start date cannot be in the future' });
  }
  private argentinaDate(now = new Date()): string { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''; return `${value('year')}-${value('month')}-${value('day')}`; }
  private async assertNoResponsibilities(id: string, role: Role, remainingRoles?: readonly Role[]): Promise<void> {
    if (role === Role.PROFESSOR && await this.prisma.salaParticipation.count({ where: { mainProfessorId: id, endDate: null } })) throw new ConflictException({ code: 'USER_HAS_SALA_RESPONSIBILITIES', message: 'No se puede quitar el rol porque tiene Personas asignadas en Sala.' });
    if (isClinicalRole(role) && (!remainingRoles || !remainingRoles.some(isClinicalRole))) {
      const [treatments, appointments] = await Promise.all([this.prisma.treatment.count({ where: { responsibleProfessionalId: id, status: 'IN_PROGRESS' } }), this.prisma.clinicalAppointment.count({ where: { professionalId: id, status: 'SCHEDULED', startAt: { gt: new Date() } } })]);
      if (treatments || appointments) throw new ConflictException({ code: 'USER_HAS_CLINICAL_RESPONSIBILITIES', message: 'No se puede quitar el rol porque tiene responsabilidades clínicas vigentes.' });
    }
  }
  private temporaryPassword(): string { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const random = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join(''); const chars = `${random}Aa1!`.split(''); for (let index = chars.length - 1; index > 0; index -= 1) { const other = randomInt(index + 1); [chars[index], chars[other]] = [chars[other]!, chars[index]!]; } return chars.join(''); }
  private safe(user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; dni: string | null; address: string | null; birthDate: Date | null; profession: string | null; athletaStartDate: Date | null; status: import('@prisma/client').InternalUserStatus; roles: { role: Role }[] }) { return { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, dni: user.dni, address: user.address, birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null, profession: user.profession, athletaStartDate: user.athletaStartDate?.toISOString().slice(0, 10) ?? null, status: user.status, roles: user.roles.map((entry) => entry.role) }; }
}
