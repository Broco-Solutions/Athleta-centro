import { Injectable } from '@nestjs/common';
import { ClinicalAppointmentStatus, TreatmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class PersonActivityService {
  constructor(private readonly prisma: PrismaService) {}
  async isActive(personId: string, now = new Date()): Promise<boolean> {
    const [sala, treatment, appointment] = await Promise.all([
      this.prisma.salaParticipation.count({ where: { personId, endDate: null } }),
      this.prisma.treatment.count({ where: { personId, status: TreatmentStatus.IN_PROGRESS } }),
      this.prisma.clinicalAppointment.count({ where: { personId, status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: now } } }),
    ]);
    return sala > 0 || treatment > 0 || appointment > 0;
  }
}
