import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
const prisma = new PrismaClient();
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') throw new Error('Local test fixture only');
  if (process.argv[2] === 'cleanup') {
    const [personId, professorId, planId] = process.argv.slice(3);
    if (!personId || !professorId || !planId) throw new Error('Fixture IDs required');
    const person = await prisma.person.findFirstOrThrow({ where: { id: personId, lastName: 'HealthDeclarationE2E' } });
    await prisma.healthDeclaration.deleteMany({ where: { personId: person.id } });
    await prisma.session.deleteMany({ where: { personId } });
    await prisma.salaParticipation.deleteMany({ where: { personId } });
    await prisma.portalCredential.deleteMany({ where: { personId } });
    await prisma.person.delete({ where: { id: personId } });
    await prisma.salaPlan.delete({ where: { id: planId } });
    await prisma.session.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: professorId } });
    await prisma.internalUser.delete({ where: { id: professorId } });
    return;
  }
  const suffix = randomUUID(); const dni = String(Math.floor(10000000 + Math.random() * 80000000));
  const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'HealthDeclarationE2E', email: `${suffix}@test.local`, normalizedEmail: `${suffix}@test.local`, roles: { create: { role: 'PROFESSOR' } }, credential: { create: { passwordHash: await argon2.hash('Synthetic-test-password1!'), mustChangePassword: false } } } });
  const plan = await prisma.salaPlan.create({ data: { name: `HealthDeclarationE2E ${suffix}`, monthlyAmount: 1000 } });
  const person = await prisma.person.create({ data: { firstName: 'Alumno', lastName: 'HealthDeclarationE2E', dni, normalizedDni: dni, phone: '0000000000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111'), mustChangePin: true } }, salaParticipations: { create: { mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2020-01-01') } } } });
  const staffToken = randomUUID();
  await prisma.session.create({ data: { kind: 'INTERNAL', internalUserId: professor.id, secretHash: createHash('sha256').update(staffToken).digest('hex'), csrfToken: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  process.stdout.write(JSON.stringify({ personId: person.id, professorId: professor.id, planId: plan.id, dni, staffToken }));
}
void main().finally(() => prisma.$disconnect());
