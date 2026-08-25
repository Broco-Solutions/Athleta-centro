import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() { await prisma.$queryRaw`SELECT 1`; }
main().finally(() => prisma.$disconnect());
