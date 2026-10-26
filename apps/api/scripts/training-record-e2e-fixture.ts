import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { assertIsolatedTestDatabase } from './test-database-safety';
assertIsolatedTestDatabase();
const prisma = new PrismaClient();
async function main(): Promise<void> {
  if (process.argv[2] === 'cleanup') {
    const [personId, professorId, planId, exerciseId] = process.argv.slice(3);
    if (!personId || !professorId || !planId || !exerciseId) throw new Error('Fixture IDs required');
    await prisma.person.findFirstOrThrow({ where: { id: personId, lastName: 'TrainingRecordE2E' } });
    await prisma.salaTrainingRecordExercise.deleteMany({ where: { record: { personId } } });
    await prisma.salaTrainingRecord.deleteMany({ where: { personId } });
    await prisma.routine.deleteMany({ where: { personId } });
    await prisma.paperHealthDeclaration.deleteMany({ where: { personId } });
    await prisma.session.deleteMany({ where: { personId } });
    await prisma.portalCredential.deleteMany({ where: { personId } });
    await prisma.salaParticipation.deleteMany({ where: { personId } });
    await prisma.person.delete({ where: { id: personId } });
    await prisma.exerciseDefinition.delete({ where: { id: exerciseId } });
    await prisma.salaPlan.delete({ where: { id: planId } });
    await prisma.session.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalUser.delete({ where: { id: professorId } });
    return;
  }
  const suffix = randomUUID();
  const email = `${suffix}@training.test`;
  const dni = String(Math.floor(10000000 + Math.random() * 80000000));
  const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'TrainingRecordE2E', email, normalizedEmail: email, roles: { create: { role: 'PROFESSOR' } }, credential: { create: { passwordHash: await argon2.hash('Synthetic-test-password1!'), mustChangePassword: false } } } });
  const plan = await prisma.salaPlan.create({ data: { name: `TrainingRecordE2E ${suffix}`, monthlyAmount: 1000, weeklySessions: 2 } });
  const person = await prisma.person.create({ data: { firstName: 'Alumno', lastName: 'TrainingRecordE2E', dni, normalizedDni: dni, phone: '0000000000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111'), mustChangePin: false } }, salaParticipations: { create: { mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2020-01-01') } } }, include: { salaParticipations: true } });
  const signed = new Date(); signed.setUTCDate(signed.getUTCDate() - 1);
  const validUntil = new Date(signed); validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
  await prisma.paperHealthDeclaration.create({ data: { personId: person.id, signedOn: signed, validUntil, registeredBy: professor.id } });
  const exercise = await prisma.exerciseDefinition.create({ data: { name: `Press sintético ${suffix}` } });
  await prisma.routine.create({ data: { personId: person.id, salaParticipationId: person.salaParticipations[0]!.id, status: 'ACTIVE', version: 1, createdAt: new Date('2026-01-01T12:00:00Z'), days: { create: [{ position: 1, name: 'Fuerza', exercises: { create: [{ position: 1, exerciseDefinitionId: exercise.id, series: '3', repetitions: '10', load: '30 kg' }, { position: 2, exerciseDefinitionId: exercise.id, duration: '30 s', load: 'Banda roja' }] } }, { position: 2, name: 'Movilidad', exercises: { create: [{ position: 1, exerciseDefinitionId: exercise.id, series: '2', repetitions: '8' }] } }] } } });
  process.stdout.write(JSON.stringify({ personId: person.id, professorId: professor.id, planId: plan.id, exerciseId: exercise.id, dni, email }));
}
void main().finally(() => prisma.$disconnect());
