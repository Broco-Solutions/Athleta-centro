import * as argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const kind = process.argv[2];
const email = `e2e.${kind}@athleta.test`;
const password = 'ValidPass1!';

async function main(): Promise<void> {
  if (!['normal', 'temporary', 'inactive', 'people', 'team', 'sala'].includes(kind ?? '')) throw new Error('Unknown e2e fixture');
  if (kind === 'people') await prisma.person.deleteMany({ where: { normalizedDni: '40999888' } });
  if (kind === 'sala') { const existing = await prisma.person.findUnique({ where: { normalizedDni: '40999777' } }); if (existing) { await prisma.salaParticipation.deleteMany({ where: { personId: existing.id } }); await prisma.person.delete({ where: { id: existing.id } }); } await prisma.salaPlan.deleteMany({ where: { name: 'Plan E2E' } }); const professor = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.sala.professor@athleta.test' } }); if (professor) { await prisma.internalUserRole.deleteMany({ where: { internalUserId: professor.id } }); await prisma.internalUser.delete({ where: { id: professor.id } }); } }
  if (kind === 'team') { const target = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.created@athleta.test' } }); if (target) { await prisma.session.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalCredential.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUserRole.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUser.delete({ where: { id: target.id } }); } }
  await prisma.session.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalCredential.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUserRole.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUser.deleteMany({ where: { normalizedEmail: email } });
  const user = await prisma.internalUser.create({ data: { firstName: 'E2E', lastName: kind ?? 'User', email, normalizedEmail: email, status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE', roles: { create: { role: kind === 'team' || kind === 'sala' ? Role.ADMINISTRATIVE : Role.PROFESSOR } } } });
  await prisma.internalCredential.create({ data: { internalUserId: user.id, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), mustChangePassword: kind === 'temporary' } });
  if (kind === 'sala') {
    const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'E2E', email: 'e2e.sala.professor@athleta.test', normalizedEmail: 'e2e.sala.professor@athleta.test', status: 'ACTIVE', roles: { create: { role: Role.PROFESSOR } } } });
    await prisma.salaPlan.create({ data: { name: 'Plan E2E', monthlyAmount: 1000, isSelectable: true } });
    await prisma.person.create({ data: { firstName: 'Persona', lastName: 'SalaE2E', dni: '40999777', normalizedDni: '40999777', phone: '3515550108', birthDate: new Date('1993-04-12T00:00:00Z') } });
    void professor;
  }
}
void main().finally(() => prisma.$disconnect());
