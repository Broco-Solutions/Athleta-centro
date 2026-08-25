import { defineConfig } from 'orval';
export default defineConfig({ athleta: { input: { target: '../../apps/api/openapi.json' }, output: { target: 'src/generated.ts', client: 'fetch', mode: 'single' } } });
