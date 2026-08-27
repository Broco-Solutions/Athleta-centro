import * as argon2 from 'argon2';
import { PrismaClient, Role, type SalaWeekday } from '@prisma/client';

const prisma = new PrismaClient();
const kind = process.argv[2];
const email = `e2e.${kind}@athleta.test`;
const password = 'ValidPass1!';

async function main(): Promise<void> {
  if (!['normal', 'temporary', 'inactive', 'people', 'team', 'sala', 'occurrence', 'clinic'].includes(kind ?? '')) throw new Error('Unknown e2e fixture');
  if (kind === 'people') await prisma.person.deleteMany({ where: { normalizedDni: '40999888' } });
  if (kind === 'sala') { const existing = await prisma.person.findUnique({ where: { normalizedDni: '40999777' } }); if (existing) { await prisma.salaParticipation.deleteMany({ where: { personId: existing.id } }); await prisma.person.delete({ where: { id: existing.id } }); } await prisma.salaPlan.deleteMany({ where: { name: 'Plan E2E' } }); const professor = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.sala.professor@athleta.test' } }); if (professor) { await prisma.internalUserRole.deleteMany({ where: { internalUserId: professor.id } }); await prisma.internalUser.delete({ where: { id: professor.id } }); } }
  if (kind === 'team') { const target = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.created@athleta.test' } }); if (target) { await prisma.session.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalCredential.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUserRole.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUser.delete({ where: { id: target.id } }); } }
  if (kind === 'occurrence') {
    const people = await prisma.person.findMany({ where: { normalizedDni: { in: ['40999661', '40999662'] } }, select: { id: true } });
    const personIds = people.map((person) => person.id);
    await prisma.salaOccurrence.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.oneOffReservation.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.fixedSalaBooking.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.salaParticipation.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.portalCredential.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    const slots = await prisma.salaScheduleSlot.findMany({ where: { startTime: new Date('1970-01-01T20:00:00.000Z') }, select: { id: true } });
    await prisma.salaScheduleException.deleteMany({ where: { scheduleSlotId: { in: slots.map((slot) => slot.id) } } });
    await prisma.salaScheduleSlot.deleteMany({ where: { id: { in: slots.map((slot) => slot.id) } } });
    await prisma.salaPlan.deleteMany({ where: { name: 'Occurrence E2E' } });
    const professor = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.occurrence.professor@athleta.test' } });
    if (professor) { await prisma.internalUserRole.deleteMany({ where: { internalUserId: professor.id } }); await prisma.internalUser.delete({ where: { id: professor.id } }); }
  }
  await prisma.session.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalCredential.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUserRole.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUser.deleteMany({ where: { normalizedEmail: email } });
  const user = await prisma.internalUser.create({ data: { firstName: 'E2E', lastName: kind ?? 'User', email, normalizedEmail: email, status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE', roles: { create: { role: kind === 'clinic' ? Role.GENERAL_ADMIN : kind === 'team' || kind === 'sala' || kind === 'occurrence' ? Role.ADMINISTRATIVE : Role.PROFESSOR } } } });
  await prisma.internalCredential.create({ data: { internalUserId: user.id, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), mustChangePassword: kind === 'temporary' } });
  if (kind === 'sala') {
    const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'E2E', email: 'e2e.sala.professor@athleta.test', normalizedEmail: 'e2e.sala.professor@athleta.test', status: 'ACTIVE', roles: { create: { role: Role.PROFESSOR } } } });
    await prisma.salaPlan.create({ data: { name: 'Plan E2E', monthlyAmount: 1000, isSelectable: true } });
    await prisma.person.create({ data: { firstName: 'Persona', lastName: 'SalaE2E', dni: '40999777', normalizedDni: '40999777', phone: '3515550108', birthDate: new Date('1993-04-12T00:00:00Z') } });
    void professor;
  }
  if (kind === 'occurrence') {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const day = new Date(`${today}T00:00:00.000Z`);
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][day.getUTCDay()] as SalaWeekday;
    const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'Occurrence', email: 'e2e.occurrence.professor@athleta.test', normalizedEmail: 'e2e.occurrence.professor@athleta.test', status: 'ACTIVE', roles: { create: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Occurrence E2E', monthlyAmount: 1000, isSelectable: true } });
    const slot = await prisma.salaScheduleSlot.create({ data: { weekday, startTime: new Date('1970-01-01T20:00:00.000Z'), durationMinutes: 60, specificCapacity: 3 } });
    const fixedPerson = await prisma.person.create({ data: { firstName: 'Fija', lastName: 'OccurrenceE2E', dni: '40999661', normalizedDni: '40999661', phone: '3515550161', birthDate: new Date('1993-04-12T00:00:00Z') } });
    const spontaneousPerson = await prisma.person.create({ data: { firstName: 'Espontánea', lastName: 'OccurrenceE2E', dni: '40999662', normalizedDni: '40999662', phone: '3515550162', birthDate: new Date('1994-05-13T00:00:00Z') } });
    const fixedParticipation = await prisma.salaParticipation.create({ data: { personId: fixedPerson.id, mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2026-01-01T00:00:00Z') } });
    await prisma.salaParticipation.create({ data: { personId: spontaneousPerson.id, mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2026-01-01T00:00:00Z') } });
    await prisma.fixedSalaBooking.create({ data: { personId: fixedPerson.id, salaParticipationId: fixedParticipation.id, scheduleSlotId: slot.id, startDate: new Date('2026-01-01T00:00:00Z') } });
  }
}
void main().finally(() => prisma.$disconnect());
