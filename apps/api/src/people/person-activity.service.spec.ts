import { PersonActivityService } from './person-activity.service';

describe('PersonActivityService', () => {
  it('derives active when any operational source is present', async () => {
    const prisma = { salaParticipation: { count: jest.fn().mockResolvedValue(0) }, treatment: { count: jest.fn().mockResolvedValue(1) }, clinicalAppointment: { count: jest.fn().mockResolvedValue(0) } } as never;
    await expect(new PersonActivityService(prisma).isActive('person')).resolves.toBe(true);
  });
  it('returns inactive when no source is current', async () => {
    const prisma = { salaParticipation: { count: jest.fn().mockResolvedValue(0) }, treatment: { count: jest.fn().mockResolvedValue(0) }, clinicalAppointment: { count: jest.fn().mockResolvedValue(0) } } as never;
    await expect(new PersonActivityService(prisma).isActive('person')).resolves.toBe(false);
  });
});
