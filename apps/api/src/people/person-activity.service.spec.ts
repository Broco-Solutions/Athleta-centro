import { PersonActivityService } from './person-activity.service';

describe('PersonActivityService', () => {
  it.each([
    { sala: 0, online: 0, treatment: 1, appointment: 0, active: true },
    { sala: 0, online: 1, treatment: 0, appointment: 0, active: true },
    { sala: 0, online: 0, treatment: 0, appointment: 0, active: false },
  ])('derives activity from current relationships ($active)', async ({ sala, online, treatment, appointment, active }) => {
    const prisma = {
      salaParticipation: { count: jest.fn().mockResolvedValue(sala) },
      onlineStudent: { count: jest.fn().mockResolvedValue(online) },
      treatment: { count: jest.fn().mockResolvedValue(treatment) },
      clinicalAppointment: { count: jest.fn().mockResolvedValue(appointment) },
    } as never;
    await expect(new PersonActivityService(prisma).isActive('person')).resolves.toBe(active);
  });
});
