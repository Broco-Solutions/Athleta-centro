import { InternalUserStatus, Role } from '@prisma/client';
import { effectivePermissions } from './permissions';
describe('effectivePermissions', () => {
  it('unions role capabilities only for active users', () => { expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR, Role.ADMINISTRATIVE])).toEqual(new Set(['PEOPLE_READ', 'PORTAL_PIN_RESET', 'SALA_RELATION_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'PEOPLE_GLOBAL_INACTIVATE', 'SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PHYSICAL_TEST_CATALOG_MANAGE', 'TEAM_READ', 'TEAM_STANDARD_USER_MANAGE', 'TEAM_STANDARD_CREDENTIAL_RESET'])); });
  it('returns no permissions for inactive users', () => { expect(effectivePermissions(InternalUserStatus.INACTIVE, [Role.GENERAL_ADMIN])).toEqual(new Set()); });
});
