import * as argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const kind = process.argv[2];
const email = `e2e.${kind}@athleta.test`;
const password = 'ValidPass1!';

async function main(): Promise<void> {
  if (!['normal', 'temporary', 'inactive', 'people', 'team'].includes(kind ?? '')) throw new Error('Unknown e2e fixture');
  if (kind === 'people') await prisma.person.deleteMany({ where: { normalizedDni: '40999888' } });
  if (kind === 'team') { const target = await prisma.internalUser.findUnique({ where: { normalizedEmail: 'e2e.created@athleta.test' } }); if (target) { await prisma.session.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalCredential.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUserRole.deleteMany({ where: { internalUserId: target.id } }); await prisma.internalUser.delete({ where: { id: target.id } }); } }
  await prisma.session.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalCredential.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUserRole.deleteMany({ where: { internalUser: { normalizedEmail: email } } });
  await prisma.internalUser.deleteMany({ where: { normalizedEmail: email } });
  const user = await prisma.internalUser.create({ data: { firstName: 'E2E', lastName: kind ?? 'User', email, normalizedEmail: email, status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE', roles: { create: { role: kind === 'team' ? Role.ADMINISTRATIVE : Role.PROFESSOR } } } });
  await prisma.internalCredential.create({ data: { internalUserId: user.id, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), mustChangePassword: kind === 'temporary' } });
}
void main().finally(() => prisma.$disconnect());
