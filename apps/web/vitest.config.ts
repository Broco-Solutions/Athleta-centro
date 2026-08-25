import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ test: { environment: 'jsdom', globals: true, exclude: ['e2e/**', 'node_modules/**'], setupFiles: ['./src/test/setup.ts'] }, resolve: { alias: { '@': path.resolve(__dirname, './src') } } });
