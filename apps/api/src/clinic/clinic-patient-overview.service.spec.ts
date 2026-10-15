import { ClinicService } from './clinic.service';

const now = new Date('2026-09-12T12:00:00.000Z');

function patient(id: string, treatments: { startDate: Date; attentions: { occurredAt: Date }[] }[], lastAttentionAt?: Date) {
  return {
    person: {
      id,
      firstName: 'Paciente',
      lastName: id,
      dni: `20.${id}`,
      sport: null,
      club: null,
      salaParticipations: [],
      clinicalAppointments: [],
      clinicalAttentions: lastAttentionAt ? [{ occurredAt: lastAttentionAt }] : [],
      treatments,
    },
  };
}

describe('ClinicService patient overview', () => {
  it('returns a patient once when any Treatment En curso meets the threshold without using other attentions', async () => {
    const staleTreatment = { startDate: new Date('2026-01-01T00:00:00.000Z'), attentions: [{ occurredAt: new Date('2026-08-01T12:00:00.000Z') }] };
    const recentTreatment = { startDate: new Date('2026-01-01T00:00:00.000Z'), attentions: [{ occurredAt: new Date('2026-09-01T12:00:00.000Z') }] };
    const prisma = { clinicalPatient: { findMany: jest.fn().mockResolvedValue([
      patient('multiple', [staleTreatment, recentTreatment], new Date('2026-09-11T12:00:00.000Z')),
      patient('recent', [recentTreatment], new Date('2026-01-01T12:00:00.000Z')),
    ]) } } as never;
    const service = new ClinicService(prisma);

    const result = await service.listPatientOverview({ page: 1, pageSize: 25, withoutRecentAttentionDays: 30 }, now);

    expect(result.data).toEqual([{ id: 'multiple', firstName: 'Paciente', lastName: 'multiple', dni: '20.multiple', sport: null, club: null, hasSalaParticipation: false, nextAppointmentAt: null, status: 'ACTIVE', lastAttentionAt: '2026-09-11T12:00:00.000Z' }]);
    expect(result.meta.total).toBe(1);
  });

  it('supports the Sí/No En curso filter and never evaluates finished Treatments', async () => {
    const findMany = jest.fn().mockResolvedValue([
      patient('active', [{ startDate: new Date('2026-01-01T00:00:00.000Z'), attentions: [] }]),
      patient('finished-only', []),
    ]);
    const prisma = { clinicalPatient: { findMany } } as never;
    const service = new ClinicService(prisma);

    await expect(service.listPatientOverview({ page: 1, pageSize: 25, treatmentInProgress: 'YES' }, now)).resolves.toMatchObject({ data: [{ id: 'active' }] });
    await expect(service.listPatientOverview({ page: 1, pageSize: 25, treatmentInProgress: 'NO' }, now)).resolves.toMatchObject({ data: [{ id: 'finished-only' }] });
    await expect(service.listPatientOverview({ page: 1, pageSize: 25, withoutRecentAttentionDays: 30 }, now)).resolves.toMatchObject({ data: [{ id: 'active' }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ person: expect.objectContaining({ select: expect.objectContaining({ treatments: expect.objectContaining({ where: { status: 'IN_PROGRESS' } }) }) }) }) }));
  });
});
