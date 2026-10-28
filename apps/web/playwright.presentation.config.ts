import { defineConfig } from '@playwright/test';

const remote = process.env.ATHLETA_PRESENTATION_URL;
export default defineConfig({
  testDir: './e2e', testMatch: ['portal-presentation.spec.ts', 'change-password-presentation.spec.ts'], workers: 1,
  use: { baseURL: remote ?? 'http://localhost:3100' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  webServer: remote ? undefined : { command: 'pnpm dev --port 3100', url: 'http://localhost:3100/portal/login', reuseExistingServer: !process.env.CI },
});
