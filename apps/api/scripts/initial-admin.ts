import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService, passwordIsValid } from '../src/auth/auth.service';
import { AuthRateLimitService } from '../src/auth/auth-rate-limit.service';

type Target = { database: string; cluster: string };
export type InitialAdminInput = Target & { email: string; firstName: string; lastName: string; password: string };
type Reader = Pick<Prisma.TransactionClient, '$queryRaw' | '$queryRawUnsafe'>;
const technical = new Set(['_prisma_migrations', 'sala_configuration', 'expense_area_catalog', 'internal_users', 'internal_user_roles', 'internal_credentials', 'sessions']);
function refuse(code: string): never { throw new Error(code); }

export async function inspectInitialDatabase(client: Reader, target: Target): Promise<Record<string, number>> {
  const [actual] = await client.$queryRaw<Array<{ database: string; cluster: string }>>`SELECT current_database() AS database, system_identifier::text AS cluster FROM pg_control_system()`;
  if (!actual || actual.database !== target.database || actual.cluster !== target.cluster) refuse('INITIAL_ADMIN_TARGET_MISMATCH');
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const expected = new Set([...Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name), '_prisma_migrations']);
  if (tables.length !== expected.size || tables.some(table => !expected.has(table.tablename))) refuse('INITIAL_ADMIN_SCHEMA_MISMATCH');
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [row] = await client.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) AS count FROM public."${tablename.replaceAll('"', '""')}"`);
    counts[tablename] = Number(row!.count);
    if (!technical.has(tablename) && counts[tablename] !== 0) refuse('INITIAL_ADMIN_BUSINESS_DATA_PRESENT');
  }
  const migrations = await client.$queryRaw<Array<{ migration_name: string; applied: boolean; rolled_back: boolean }>>`SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations`;
  const migrationNames = readdirSync(resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const applied = migrations.filter(migration => migration.applied && !migration.rolled_back).map(migration => migration.migration_name);
  if (migrations.some(migration => !migration.applied && !migration.rolled_back) || applied.length !== migrationNames.length || migrationNames.some(name => !applied.includes(name))) refuse('INITIAL_ADMIN_MIGRATIONS_MISMATCH');
  const config = await client.$queryRaw<Array<{ id: string; general_capacity: number }>>`SELECT id, general_capacity FROM sala_configuration`;
  if (config.length > 1 || config.some(row => row.id !== 'default' || row.general_capacity !== 10)) refuse('INITIAL_ADMIN_CONFIGURATION_UNEXPECTED');
  const areas = await client.$queryRaw<Array<{ id: string; name: string; system_code: string; is_selectable: boolean }>>`SELECT id, name, system_code, is_selectable FROM expense_area_catalog ORDER BY id`;
  const areaNames = ['Sala', 'General', 'Clínica'];
  const areaCodes = ['SALA', 'GENERAL', 'CLINIC'];
  if (areas.length !== 3 || areas.some((area, index) => area.id !== `00000000-0000-4000-8000-00000000a00${index + 1}` || area.name !== areaNames[index] || area.system_code !== areaCodes[index] || !area.is_selectable)) refuse('INITIAL_ADMIN_STRUCTURAL_DATA_UNEXPECTED');
  return counts;
}

export async function initializeInitialAdministrator(prisma: PrismaService, input: InitialAdminInput): Promise<{ status: 'created' | 'already-initialized'; userId: string }> {
  const email = input.email.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !input.firstName.trim() || !input.lastName.trim() || !passwordIsValid(input.password)) refuse('INITIAL_ADMIN_INPUT_INVALID');
  const auth = new AuthService(prisma, new AuthRateLimitService(prisma));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(417284, 1)`;
        const counts = await inspectInitialDatabase(tx, input);
        if (counts.internal_users === 0) {
          if (counts.internal_user_roles || counts.internal_credentials || counts.sessions) refuse('INITIAL_ADMIN_AUTH_STATE_UNEXPECTED');
          const passwordHash = await auth.hashPassword(input.password);
          const user = await tx.internalUser.create({ data: { email, normalizedEmail: email.toLowerCase(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), status: 'ACTIVE', roles: { create: { role: Role.GENERAL_ADMIN } }, credential: { create: { passwordHash, mustChangePassword: true } } } });
          return { status: 'created' as const, userId: user.id };
        }
        if (counts.internal_users !== 1 || counts.internal_user_roles !== 1 || counts.internal_credentials !== 1) refuse('INITIAL_ADMIN_AUTH_STATE_UNEXPECTED');
        const user = await tx.internalUser.findUnique({ where: { normalizedEmail: email.toLowerCase() }, include: { roles: true, credential: true } });
        if (!user || user.email !== email || user.status !== 'ACTIVE' || user.roles.length !== 1 || user.roles[0]?.role !== Role.GENERAL_ADMIN || !user.credential) refuse('INITIAL_ADMIN_EXISTING_ACCOUNT_UNEXPECTED');
        if (user.credential.mustChangePassword && !(await argon2.verify(user.credential.passwordHash, input.password))) refuse('INITIAL_ADMIN_CREDENTIAL_MISMATCH');
        if (await tx.session.count({ where: { OR: [{ kind: { not: 'INTERNAL' } }, { internalUserId: null }, { internalUserId: { not: user.id } }] } })) refuse('INITIAL_ADMIN_SESSION_UNEXPECTED');
        return { status: 'already-initialized' as const, userId: user.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  return refuse('INITIAL_ADMIN_CONCURRENT_INITIALIZATION');
}

export async function runInitialAdminFromEnvironment(): Promise<void> {
  const database = process.env.BOOTSTRAP_EXPECTED_DATABASE ?? '';
  const cluster = process.env.BOOTSTRAP_EXPECTED_CLUSTER ?? '';
  const url = new URL(process.env.DATABASE_URL ?? 'invalid');
  if (!database || !cluster || decodeURIComponent(url.pathname.slice(1)) !== database || ['railway', 'postgres', 'template0', 'template1'].includes(database) || url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public') refuse('INITIAL_ADMIN_TARGET_NOT_EXPLICIT');
  const prisma = new PrismaService();
  try {
    const result = await initializeInitialAdministrator(prisma, { database, cluster, email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '', firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME ?? '', lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME ?? '', password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '' });
    process.stdout.write(JSON.stringify({ status: result.status, database, userId: result.userId }) + '\n');
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) void runInitialAdminFromEnvironment().catch(error => {
  // Deliberately never serialize Prisma errors, input, hashes or connection strings.
  const message = error instanceof Error && /^INITIAL_ADMIN_[A-Z_]+$/.test(error.message) ? error.message : 'INITIAL_ADMIN_FAILED';
  process.stderr.write(message + '\n'); process.exitCode = 1;
});
