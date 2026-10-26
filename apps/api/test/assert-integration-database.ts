import { assertIsolatedTestDatabase } from '../scripts/test-database-safety';

if (expect.getState().testPath?.endsWith('.integration-spec.ts')) assertIsolatedTestDatabase();
