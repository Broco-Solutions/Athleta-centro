import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WINDOW_MS = 15 * 60 * 1000;
const GENERAL_WINDOW_MS = 60 * 1000;
const GENERAL_LIMIT = 300;
const LOGIN_FAILURE_LIMIT = 5;

type GeneralBucket = { count: number; startedAt: number };

@Injectable()
export class AuthRateLimitService {
  private readonly generalBuckets = new Map<string, GeneralBucket>();

  constructor(private readonly prisma: PrismaService) {}

  assertGeneralLimit(ip: string): void {
    const now = Date.now();
    const existing = this.generalBuckets.get(ip);
    const bucket = !existing || now - existing.startedAt >= GENERAL_WINDOW_MS
      ? { count: 0, startedAt: now }
      : existing;
    bucket.count += 1;
    this.generalBuckets.set(ip, bucket);
    if (bucket.count > GENERAL_LIMIT) this.reject();
  }

  async assertLoginAllowed(email: string, ip: string): Promise<void> {
    const now = new Date();
    const keys = this.loginKeys(email, ip);
    const buckets = await this.prisma.authAttemptBucket.findMany({ where: { key: { in: keys } } });
    if (buckets.some((bucket) => bucket.lockedUntil && bucket.lockedUntil > now)) this.reject();
  }

  async recordLoginFailure(email: string, ip: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const key of this.loginKeys(email, ip)) {
        const current = await tx.authAttemptBucket.findUnique({ where: { key } });
        const inWindow = current && now.getTime() - current.windowStartedAt.getTime() < WINDOW_MS;
        const failureCount = inWindow ? current.failureCount + 1 : 1;
        const lockMilliseconds = failureCount < LOGIN_FAILURE_LIMIT ? 0 : 30_000 * 2 ** Math.min(failureCount - LOGIN_FAILURE_LIMIT, 4);
        await tx.authAttemptBucket.upsert({
          where: { key },
          create: { key, failureCount, windowStartedAt: now, lockedUntil: lockMilliseconds ? new Date(now.getTime() + lockMilliseconds) : null },
          update: { failureCount, windowStartedAt: inWindow ? current.windowStartedAt : now, lockedUntil: lockMilliseconds ? new Date(now.getTime() + lockMilliseconds) : null },
        });
      }
    });
  }

  async clearLoginFailures(email: string, ip: string): Promise<void> {
    await this.prisma.authAttemptBucket.deleteMany({ where: { key: { in: this.loginKeys(email, ip) } } });
  }

  private loginKeys(email: string, ip: string): string[] {
    return [`internal-login:email:${email.trim().toLowerCase()}`, `internal-login:ip:${ip}`];
  }

  private reject(): never {
    throw new HttpException({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
