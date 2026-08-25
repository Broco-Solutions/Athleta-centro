import { Role, InternalUserStatus } from '@prisma/client';

export const permissions = ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'PEOPLE_DELETE_EMPTY', 'PEOPLE_GLOBAL_INACTIVATE', 'PORTAL_PIN_RESET', 'TEAM_READ', 'TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE', 'TEAM_STANDARD_CREDENTIAL_RESET', 'TEAM_GENERAL_ADMIN_CREDENTIAL_RESET'] as const;
export type Permission = (typeof permissions)[number];
const allStandard: Permission[] = ['PEOPLE_READ', 'PORTAL_PIN_RESET'];
const rolePermissions: Record<Role, readonly Permission[]> = {
  PROFESSOR: [...allStandard, 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL'], KINESIOLOGIST: [...allStandard, 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL'], OSTEOPATH: [...allStandard, 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL'], ADMINISTRATIVE: [...allStandard, 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'PEOPLE_GLOBAL_INACTIVATE', 'TEAM_READ', 'TEAM_STANDARD_USER_MANAGE', 'TEAM_STANDARD_CREDENTIAL_RESET'], GENERAL_ADMIN: permissions, BROCO_SUPPORT: [],
};
export function effectivePermissions(status: InternalUserStatus, roles: readonly Role[]): Set<Permission> { return status === 'ACTIVE' ? new Set(roles.flatMap((role) => rolePermissions[role])) : new Set(); }
