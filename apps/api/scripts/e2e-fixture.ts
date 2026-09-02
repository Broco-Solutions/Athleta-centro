import * as argon2 from 'argon2';
import { PrismaClient, Role, type SalaWeekday } from '@prisma/client';

const prisma = new PrismaClient();
const kind = process.argv[2];
const email = `e2e.${kind}@athleta.test`;
const password = 'ValidPass1!';

async function main(): Promise<void> {
if (!['normal', 'temporary', 'inactive', 'people', 'team', 'sala', 'occurrence', 'multislot', 'clinic', 'service', 'portal-reset', 'portal-fixed-edit'].includes(kind ?? '')) throw new Error('Unknown e2e fixture');
  if (kind === 'people') await prisma.person.deleteMany({ where: { normalizedDni: '40999888' } });
  if (kind === 'sala') { const existing = await prisma.person.findUnique({ where: { normalizedDni: '40999777' } }); if (existing) { await prisma.clinicalPatient.deleteMany({ where: { personId: existing.id } }); await prisma.salaParticipation.deleteMany({ where: { personId: existing.id } }); await prisma.person.delete({ where: { id: existing.id } }); } await prisma.salaPlan.deleteMany({ where: { name: 'Plan E2E' } }); const professor = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.sala.professor@athleta.test' } }); if (professor) { await prisma.internalUserRole.deleteMany({ where: { internalUserId: professor.id } }); await prisma.internalUser.delete({ where: { id: professor.id } }); } }
  if (kind === 'service') await prisma.salaServiceType.deleteMany({ where: { normalizedName: 'servicio retiro e2e' } });
  if (kind === 'portal-reset') {
    const existing = await prisma.person.findUnique({ where: { normalizedDni: '40999444' } });
    if (existing) { await prisma.session.deleteMany({ where: { personId: existing.id } }); await prisma.portalCredential.deleteMany({ where: { personId: existing.id } }); await prisma.salaOccurrence.deleteMany({ where: { personId: existing.id } }); await prisma.oneOffReservation.deleteMany({ where: { personId: existing.id } }); await prisma.fixedSalaBooking.deleteMany({ where: { personId: existing.id } }); await prisma.salaParticipation.deleteMany({ where: { personId: existing.id } }); await prisma.person.delete({ where: { id: existing.id } }); }
    await prisma.salaPlan.deleteMany({ where: { name: 'Portal Reset E2E' } });
  }
  if (kind === 'portal-fixed-edit') {
    const existing = await prisma.person.findUnique({ where: { normalizedDni: '40999445' } });
    if (existing) { await prisma.session.deleteMany({ where: { personId: existing.id } }); await prisma.portalCredential.deleteMany({ where: { personId: existing.id } }); await prisma.salaOccurrence.deleteMany({ where: { personId: existing.id } }); await prisma.oneOffReservation.deleteMany({ where: { personId: existing.id } }); await prisma.fixedSalaBooking.deleteMany({ where: { personId: existing.id } }); await prisma.salaParticipation.deleteMany({ where: { personId: existing.id } }); await prisma.person.delete({ where: { id: existing.id } }); }
    await prisma.salaPlan.deleteMany({ where: { name: 'Portal Fixed Edit E2E' } }); await prisma.salaServiceType.deleteMany({ where: { normalizedName: 'evaluacion portal fixed edit e2e' } });
    const windows = await prisma.salaScheduleSlot.findMany({ where: { weekday: 'MONDAY', startTime: new Date('1970-01-01T06:00:00.000Z') }, select: { id: true } }); await prisma.salaScheduleException.deleteMany({ where: { scheduleSlotId: { in: windows.map((window) => window.id) } } }); await prisma.salaScheduleSlot.deleteMany({ where: { id: { in: windows.map((window) => window.id) } } });
  }
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
  if (kind === 'multislot') {
    const people = await prisma.person.findMany({ where: { normalizedDni: { in: ['40999551', '40999552'] } }, select: { id: true } }); const personIds = people.map((person) => person.id);
    await prisma.salaOccurrence.deleteMany({ where: { personId: { in: personIds } } }); await prisma.oneOffReservation.deleteMany({ where: { personId: { in: personIds } } }); await prisma.fixedSalaBooking.deleteMany({ where: { personId: { in: personIds } } }); await prisma.salaParticipation.deleteMany({ where: { personId: { in: personIds } } }); await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    const windows = await prisma.salaScheduleSlot.findMany({ where: { weekday: 'MONDAY', startTime: new Date('1970-01-01T08:00:00.000Z') }, select: { id: true } }); await prisma.salaScheduleException.deleteMany({ where: { scheduleSlotId: { in: windows.map((window) => window.id) } } }); await prisma.salaScheduleSlot.deleteMany({ where: { id: { in: windows.map((window) => window.id) } } });
    await prisma.salaServiceType.deleteMany({ where: { normalizedName: 'gimnasio e2e' } }); await prisma.salaPlan.deleteMany({ where: { name: 'Multi slot E2E' } }); const professor = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.multislot.professor@athleta.test' } }); if (professor) { await prisma.internalUserRole.deleteMany({ where: { internalUserId: professor.id } }); await prisma.internalUser.delete({ where: { id: professor.id } }); }
  }
  await prisma.session.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalCredential.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUserRole.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUser.deleteMany({ where: { normalizedEmail: email } });
  const user = await prisma.internalUser.create({ data: { firstName: 'E2E', lastName: kind ?? 'User', email, normalizedEmail: email, status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE', roles: { create: { role: kind === 'clinic' || kind === 'service' ? Role.GENERAL_ADMIN : kind === 'team' || kind === 'sala' || kind === 'occurrence' || kind === 'multislot' ? Role.ADMINISTRATIVE : Role.PROFESSOR } } } });
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
  if (kind === 'multislot') {
    const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'MultiSlot', email: 'e2e.multislot.professor@athleta.test', normalizedEmail: 'e2e.multislot.professor@athleta.test', status: 'ACTIVE', roles: { create: { role: Role.PROFESSOR } } } }); const plan = await prisma.salaPlan.create({ data: { name: 'Multi slot E2E', monthlyAmount: 1000 } });
    await prisma.salaScheduleSlot.create({ data: { weekday: 'MONDAY', startTime: new Date('1970-01-01T08:00:00.000Z'), durationMinutes: 720, specificCapacity: 1 } }); await prisma.salaServiceType.create({ data: { name: 'Gimnasio E2E', normalizedName: 'gimnasio e2e', durationMinutes: 60 } });
    for (const [index, dni] of ['40999551','40999552'].entries()) { const person = await prisma.person.create({ data: { firstName: `Persona${index + 1}`, lastName: 'MultiSlotE2E', dni, normalizedDni: dni, phone: '3515550155', birthDate: new Date('1990-01-01T00:00:00Z') } }); await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2026-01-01T00:00:00Z') } }); }
  }
  if (kind === 'service') await prisma.salaServiceType.create({ data: { name: 'Servicio Retiro E2E', normalizedName: 'servicio retiro e2e', durationMinutes: 45 } });
  if (kind === 'portal-reset') {
    const plan = await prisma.salaPlan.create({ data: { name: 'Portal Reset E2E', monthlyAmount: 1000, isSelectable: true } });
    const person = await prisma.person.create({ data: { firstName: 'Portal', lastName: 'ResetE2E', dni: '40999444', normalizedDni: '40999444', phone: '3515550144', birthDate: new Date('1990-01-01T00:00:00Z') } });
    await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: user.id, planId: plan.id, startDate: new Date('2020-01-01T00:00:00Z') } });
    await prisma.portalCredential.create({ data: { personId: person.id, pinHash: await argon2.hash('1234', { type: argon2.argon2id }), mustChangePin: false } });
  }
  if (kind === 'portal-fixed-edit') {
    const plan = await prisma.salaPlan.create({ data: { name: 'Portal Fixed Edit E2E', monthlyAmount: 1000, isSelectable: true } }); const service = await prisma.salaServiceType.create({ data: { name: 'Evaluacion Portal Fixed Edit E2E', normalizedName: 'evaluacion portal fixed edit e2e', durationMinutes: 45 } }); const existingWindow = await prisma.salaScheduleSlot.findFirst({ where: { weekday: 'MONDAY', isActive: true, startTime: { lte: new Date('1970-01-01T10:00:00.000Z') }, durationMinutes: { gte: 120 } }, orderBy: { startTime: 'asc' } }); const window = existingWindow ?? await prisma.salaScheduleSlot.create({ data: { weekday: 'MONDAY', startTime: new Date('1970-01-01T06:00:00.000Z'), durationMinutes: 360, specificCapacity: 5 } }); const person = await prisma.person.create({ data: { firstName: 'Portal', lastName: 'FixedEditE2E', dni: '40999445', normalizedDni: '40999445', phone: '3515550145', birthDate: new Date('1990-01-01T00:00:00Z') } }); const participation = await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: user.id, planId: plan.id, startDate: new Date('2020-01-01T00:00:00Z') } }); await prisma.fixedSalaBooking.create({ data: { personId: person.id, salaParticipationId: participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, serviceDurationMinutes: 45, startTime: new Date('1970-01-01T10:00:00.000Z'), startDate: new Date('2026-09-07T00:00:00Z') } }); await prisma.portalCredential.create({ data: { personId: person.id, pinHash: await argon2.hash('1234', { type: argon2.argon2id }), mustChangePin: false } });
  }
}
void main().finally(() => prisma.$disconnect());
