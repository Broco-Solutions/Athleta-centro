import { defineConfig } from '@playwright/test';
import { assertIsolatedTestDatabase } from '../api/scripts/test-database-safety';

assertIsolatedTestDatabase();
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://localhost:3000' } });
