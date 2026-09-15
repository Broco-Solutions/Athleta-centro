import { ClinicalAppointmentStatus, ClinicalCoverage, Role } from '@prisma/client';
import { ClinicService } from './clinic.service';

function appointment(status: ClinicalAppointmentStatus, attention: unknown = null) {
  return {
    id: 'appointment-1',
    personId: 'person-1',
    professionalId: 'professional-1',
    startAt: new Date('2026-09-20T13:00:00.000Z'),
    durationMinutes: 60,
    status,
    operationalNote: null,
    person: { id: 'person-1', firstName: 'Ana', lastName: 'Sintética', dni: '45000001' },
    professional: { id: 'professional-1', firstName: 'Pablo', lastName: 'Clínico', roles: [{ role: Role.KINESIOLOGIST }] },
    attention,
  };
}

function emptyAttention() {
  return {
    id: 'attention-1',
    coverage: ClinicalCoverage.PRIVATE,
    treatmentId: null,
    evolution: null,
    charge: null,
    _count: { evaluations: 0, clinicalIncomes: 0 },
  };
}

describe('ClinicService appointment correction', () => {
  it('creates one unbilled Attention with explicit coverage when entering Atendido', async () => {
    const scheduled = appointment(ClinicalAppointmentStatus.SCHEDULED);
    const attended = appointment(ClinicalAppointmentStatus.ATTENDED, emptyAttention());
    const transaction = {
      clinicalAppointment: {
        findUnique: jest.fn().mockResolvedValue(scheduled),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(attended),
      },
      clinicalAttention: { create: jest.fn().mockResolvedValue({ id: 'attention-1' }) },
    };
    const prismaMock = { $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)) };
    const service = new ClinicService(prismaMock as never);

    await expect(service.correct('appointment-1', { status: ClinicalAppointmentStatus.ATTENDED, coverage: ClinicalCoverage.PRIVATE }))
      .resolves.toMatchObject({ status: 'ATTENDED', hasAttention: true, coverage: 'PRIVATE' });

    expect(transaction.clinicalAttention.create).toHaveBeenCalledWith({
      data: {
        appointmentId: 'appointment-1',
        personId: 'person-1',
        professionalId: 'professional-1',
        occurredAt: scheduled.startAt,
        coverage: ClinicalCoverage.PRIVATE,
      },
    });
  });

  it('rejects entering Atendido without coverage before changing the appointment', async () => {
    const prismaMock = { $transaction: jest.fn() };
    const service = new ClinicService(prismaMock as never);

    await expect(service.correct('appointment-1', { status: ClinicalAppointmentStatus.ATTENDED }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'CLINIC_ATTENTION_COVERAGE_REQUIRED' }) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([ClinicalAppointmentStatus.SCHEDULED, ClinicalAppointmentStatus.CANCELLED, ClinicalAppointmentStatus.ABSENT])(
    'deletes only an empty Attention when correcting Atendido to %s',
    async (target) => {
      const current = appointment(ClinicalAppointmentStatus.ATTENDED, emptyAttention());
      const corrected = appointment(target);
      const transaction = {
        clinicalAppointment: {
          findUnique: jest.fn().mockResolvedValue(current),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(corrected),
        },
        clinicalAttention: { delete: jest.fn().mockResolvedValue(undefined) },
      };
      const prismaMock = { $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)) };
      const service = new ClinicService(prismaMock as never);

      await expect(service.correct('appointment-1', { status: target })).resolves.toMatchObject({ status: target, hasAttention: false });
      expect(transaction.clinicalAttention.delete).toHaveBeenCalledWith({ where: { id: 'attention-1' } });
      expect(transaction.clinicalAppointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appointment-1', status: ClinicalAppointmentStatus.ATTENDED },
        data: { status: target },
      });
    },
  );

  it('preserves an Attention with clinical or financial dependencies', async () => {
    const dependent = { ...emptyAttention(), evolution: { id: 'evolution-1' } };
    const transaction = {
      clinicalAppointment: { findUnique: jest.fn().mockResolvedValue(appointment(ClinicalAppointmentStatus.ATTENDED, dependent)) },
      clinicalAttention: { delete: jest.fn() },
    };
    const prismaMock = { $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)) };
    const service = new ClinicService(prismaMock as never);

    await expect(service.correct('appointment-1', { status: ClinicalAppointmentStatus.CANCELLED }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'ATTENTION_HAS_DEPENDENCIES' }) });
    expect(transaction.clinicalAttention.delete).not.toHaveBeenCalled();
  });
});
