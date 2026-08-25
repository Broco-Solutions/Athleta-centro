process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://athleta:athleta_local_only@localhost:5432/athleta?schema=public';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.SESSION_SECRET = 'a-test-only-session-secret-that-is-long-enough';
