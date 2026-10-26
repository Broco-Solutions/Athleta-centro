import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SESSION_SECRET: z.string().min(32),
  ATHLETA_CLINIC_ENABLED: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('athleta-private'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
});

export type Environment = z.infer<typeof environmentSchema>;
export const validateEnvironment = (values: Record<string, unknown>): Environment => environmentSchema.parse(values);
export const isClinicEnabled = (values: Record<string, string | undefined> = process.env): boolean => values.ATHLETA_CLINIC_ENABLED === 'true';
