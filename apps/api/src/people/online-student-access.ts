import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { InternalActor } from '../auth/permissions.guard';

export function supervisesOnlineStudents(actor: InternalActor): boolean {
  return actor.roles.includes('GENERAL_ADMIN') || actor.roles.includes('ADMINISTRATIVE');
}

export function visibleOnlineStudents(actor: InternalActor, manage = false): Prisma.OnlineStudentWhereInput {
  if (actor.roles.includes('GENERAL_ADMIN') || (!manage && actor.roles.includes('ADMINISTRATIVE'))) return {};
  return actor.roles.includes('PROFESSOR') ? { professorId: actor.id } : { id: { in: [] } };
}

export function visiblePeople(actor: InternalActor): Prisma.PersonWhereInput {
  if (supervisesOnlineStudents(actor)) return {};
  return { OR: [
    { onlineStudents: { none: {} } },
    { onlineStudents: { some: { ...visibleOnlineStudents(actor), endDate: null } } },
    { AND: [
      { onlineStudents: { none: { endDate: null } } },
      { onlineStudents: { some: visibleOnlineStudents(actor) } },
    ] },
    { salaParticipations: { some: { plan: { isOnline: false } } } },
    { clinicalPatient: { isNot: null } },
  ] };
}

export function personNotFound(): NotFoundException {
  return new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
}
