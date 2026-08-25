import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SESSION_SECRET: z.string().min(32),
});

export type Environment = z.infer<typeof environmentSchema>;
export const validateEnvironment = (values: Record<string, unknown>): Environment => environmentSchema.parse(values);
