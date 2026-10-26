import { assertIntegrationTestInvocation } from '../scripts/test-database-safety';

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3001';
assertIntegrationTestInvocation(process.argv);
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.SESSION_SECRET ??= 'a-test-only-session-secret-that-is-long-enough';
process.env.ATHLETA_CLINIC_ENABLED ??= 'true';
