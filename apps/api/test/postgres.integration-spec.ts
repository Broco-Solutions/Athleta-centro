import { PrismaClient } from '@prisma/client';

describe('PostgreSQL integration foundation', () => {
  it('connects to the real PostgreSQL integration database', async () => {
    const prisma = new PrismaClient();
    await expect(prisma.$queryRaw<{ value: number }[]>`SELECT 1 AS value`).resolves.toEqual([{ value: 1 }]);
    await prisma.$disconnect();
  });
});
