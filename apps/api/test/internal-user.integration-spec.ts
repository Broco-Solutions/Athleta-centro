import { ConflictException } from '@nestjs/common';
import { InternalUserStatus, Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('InternalUser persistence and lifecycle', () => {
  const prisma = new PrismaService();
  const service = new InternalUserService(prisma);
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  afterEach(async () => { await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  it('normalizes email and enforces its database uniqueness', async () => {
    await service.create({ firstName: 'Ada', lastName: 'Lovelace', email: ' Ada@Athleta.test ', roles: [Role.PROFESSOR] });
    await expect(service.create({ firstName: 'Grace', lastName: 'Hopper', email: 'ada@athleta.test', roles: [Role.ADMINISTRATIVE] })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('preserves roles when inactivated and reactivated', async () => {
    const user = await service.create({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@athleta.test', roles: [Role.PROFESSOR] });
    await service.inactivate(user.id);
    const reactivated = await service.reactivate(user.id);
    expect(reactivated.status).toBe(InternalUserStatus.ACTIVE); expect(reactivated.roles).toHaveLength(1);
  });
  it('blocks removing the last role from an active user', async () => {
    const user = await service.create({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@athleta.test', roles: [Role.PROFESSOR] });
    await expect(service.removeRole(user.id, Role.PROFESSOR)).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not allow concurrent removals to leave an active user without roles', async () => { const user = await service.create({ firstName: 'Race', lastName: 'Roles', email: 'race@athleta.test', roles: [Role.PROFESSOR, Role.KINESIOLOGIST] }); const results = await Promise.allSettled([service.removeRole(user.id, Role.PROFESSOR), service.removeRole(user.id, Role.KINESIOLOGIST)]); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.internalUserRole.count({ where: { internalUserId: user.id } })).toBe(1); });
});
