import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://localhost:3000' }, webServer: [{ command: 'pnpm --filter @athleta/api dev', cwd: '../..', url: 'http://localhost:3001/health', reuseExistingServer: !process.env.CI }, { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }] });
