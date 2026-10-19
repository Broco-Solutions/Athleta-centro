import { InternalUserStatus, Role } from '@prisma/client';
import { effectivePermissions } from './permissions';
describe('effectivePermissions', () => {
  it('reserves payment management for Administration, preserving role unions', () => {
    const professor = effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR]);
    expect(professor.has('SALA_PAYMENT_READ')).toBe(true);
    expect(professor.has('SALA_PAYMENT_REGISTER')).toBe(true);
    for (const permission of ['EXPENSE_CREATE', 'FINANCE_OPERATIONAL_READ', 'FINANCE_EXECUTIVE_READ', 'FINANCE_EXPORT', 'PAYMENT_METHOD_CATALOG_MANAGE', 'EXPENSE_HISTORY_READ', 'EXPENSE_MANAGE'] as const) expect(professor.has(permission)).toBe(false);
    expect(professor.has('SALA_PAYMENT_MANAGE')).toBe(false);
    for (const role of [Role.ADMINISTRATIVE, Role.GENERAL_ADMIN]) {
      for (const permission of ['SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'SALA_PAYMENT_MANAGE'] as const) expect(effectivePermissions(InternalUserStatus.ACTIVE, [role]).has(permission)).toBe(true);
    }
    const combined = effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR, Role.ADMINISTRATIVE]);
    for (const permission of ['SALA_PAYMENT_REGISTER', 'SALA_PAYMENT_MANAGE', 'FINANCE_OPERATIONAL_READ'] as const) expect(combined.has(permission)).toBe(true);
    for (const role of [Role.KINESIOLOGIST, Role.OSTEOPATH]) expect(effectivePermissions(InternalUserStatus.ACTIVE, [role]).has('EXPENSE_CREATE')).toBe(true);
  });
  it('unions role capabilities only for active users', () => {
    const permissions = effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR, Role.ADMINISTRATIVE]);
    expect([...permissions]).toEqual(expect.arrayContaining([
      'CLINIC_OPERATIONAL_READ',
      'CLINIC_APPOINTMENT_MANAGE',
      'CLINIC_ORDER_MANAGE',
      'SALA_CLINICAL_INDICATION_READ',
      'SALA_CLINICAL_INDICATION_CLOSE',
      'PEOPLE_READ',
      'SALA_RELATION_READ',
    ]));
    expect(permissions.has('CLINICAL_HISTORY_READ')).toBe(false);
  });
  it('lets Professor operate agenda and routines while reserving schedule configuration for Administration', () => {
    const professor = effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR]);
    expect(professor.has('SALA_AGENDA_MANAGE')).toBe(true);
    expect(professor.has('SALA_ROUTINE_MANAGE')).toBe(true);
    expect(professor.has('SALA_SCHEDULE_MANAGE')).toBe(false);
    expect(professor.has('SALA_SERVICE_DURATION_MANAGE')).toBe(false);
    for (const role of [Role.ADMINISTRATIVE, Role.GENERAL_ADMIN]) {
      expect(effectivePermissions(InternalUserStatus.ACTIVE, [role]).has('SALA_SERVICE_DURATION_MANAGE')).toBe(true);
    }
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.ADMINISTRATIVE]).has('SALA_SCHEDULE_MANAGE')).toBe(true);
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.GENERAL_ADMIN]).has('SALA_SCHEDULE_MANAGE')).toBe(true);
  });
  it('returns no permissions for inactive users', () => { expect(effectivePermissions(InternalUserStatus.INACTIVE, [Role.GENERAL_ADMIN])).toEqual(new Set()); });
  it('keeps clinical history unavailable to operational-only roles', () => {
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.ADMINISTRATIVE]).has('CLINICAL_HISTORY_READ')).toBe(false);
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR]).has('CLINICAL_HISTORY_READ')).toBe(false);
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.KINESIOLOGIST]).has('CLINICAL_HISTORY_READ')).toBe(true);
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.OSTEOPATH]).has('CLINICAL_HISTORY_READ')).toBe(true);
    expect(effectivePermissions(InternalUserStatus.ACTIVE, [Role.GENERAL_ADMIN]).has('CLINICAL_HISTORY_READ')).toBe(true);
  });
  it('grants Professor only the restricted Sala indication projection', () => {
    const permissions = effectivePermissions(InternalUserStatus.ACTIVE, [Role.PROFESSOR]);
    expect(permissions.has('SALA_CLINICAL_INDICATION_READ')).toBe(true);
    expect(permissions.has('CLINIC_INDICATION_CONTENT_MANAGE')).toBe(false);
  });
  it('keeps operational and clinical write permissions separate', () => {
    const administrative = effectivePermissions(InternalUserStatus.ACTIVE, [Role.ADMINISTRATIVE]);
    expect(administrative.has('CLINIC_ATTENTION_REGISTER')).toBe(true);
    expect(administrative.has('CLINICAL_HISTORY_WRITE')).toBe(false);
    expect(administrative.has('CLINIC_TREATMENT_MANAGE')).toBe(false);
    const clinical = effectivePermissions(InternalUserStatus.ACTIVE, [Role.KINESIOLOGIST]);
    expect(clinical.has('CLINICAL_HISTORY_WRITE')).toBe(true);
    expect(clinical.has('CLINIC_EVOLUTION_MANAGE')).toBe(true);
    expect(clinical.has('CLINIC_TREATMENT_MANAGE')).toBe(true);
  });
});
