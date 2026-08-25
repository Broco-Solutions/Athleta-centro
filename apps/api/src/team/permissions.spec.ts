import { InternalUserStatus, Role } from '@prisma/client';
import { effectivePermissions } from './permissions';
describe('effectivePermissions', () => {
  it('unions role capabilities only for active users', () => { expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR, Role.ADMINISTRATIVE])).toEqual(new Set(['PEOPLE_READ', 'PORTAL_PIN_RESET', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'PEOPLE_GLOBAL_INACTIVATE', 'TEAM_STANDARD_USER_MANAGE'])); });
  it('returns no permissions for inactive users', () => { expect(effectivePermissions(InternalUserStatus.INACTIVE, [Role.GENERAL_ADMIN])).toEqual(new Set()); });
});
