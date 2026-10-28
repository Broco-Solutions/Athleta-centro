import { defineConfig } from 'vitest/config';
import path from 'node:path';
// Bound concurrent jsdom workers: unrestricted workers exhaust WSL resources and
// produce unrelated timeouts. Keep every test and its existing timeout/assertions.
export default defineConfig({ test: { pool: 'threads', maxWorkers: 2, environment: 'jsdom', globals: true, exclude: ['e2e/**', 'node_modules/**'], setupFiles: ['./src/test/setup.ts'] }, resolve: { alias: { '@': path.resolve(__dirname, './src') } } });
