import { validateEnvironment } from './env';

describe('validateEnvironment', () => {
  const validEnvironment = { DATABASE_URL: 'postgresql://athleta:secret@localhost:5432/athleta', WEB_ORIGIN: 'http://localhost:3000', SESSION_SECRET: 'a-valid-session-secret-with-more-than-32-characters' };
  it('applies safe defaults to a valid environment', () => { expect(validateEnvironment(validEnvironment)).toMatchObject({ NODE_ENV: 'development', PORT: 3001, LOG_LEVEL: 'info' }); });
  it('coerces a Railway-provided PORT value to a number', () => { expect(validateEnvironment({ ...validEnvironment, PORT: '8080' }).PORT).toBe(8080); });
  it('disables Clinic by default and accepts only explicit boolean strings', () => { expect(validateEnvironment(validEnvironment).ATHLETA_CLINIC_ENABLED).toBe(false); expect(validateEnvironment({ ...validEnvironment, ATHLETA_CLINIC_ENABLED: 'true' }).ATHLETA_CLINIC_ENABLED).toBe(true); expect(() => validateEnvironment({ ...validEnvironment, ATHLETA_CLINIC_ENABLED: 'yes' })).toThrow(); });
  it('fails fast when a required secret is absent', () => { expect(() => validateEnvironment({ ...validEnvironment, SESSION_SECRET: undefined })).toThrow(); });
});
