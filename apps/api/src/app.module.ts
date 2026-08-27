import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { InternalUserService } from './team/internal-user.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { AuthSecurityMiddleware } from './auth/auth-security.middleware';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { PermissionsGuard } from './auth/permissions.guard';
import { PeopleController } from './people/people.controller';
import { PeopleService } from './people/people.service';
import { TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { SalaController } from './sala/sala.controller';
import { SalaService } from './sala/sala.service';
import { FinanceController } from './finance/finance.controller';
import { FinanceCatalogService } from './finance/finance.service';
import { ClinicController } from './clinic/clinic.controller'; import { ClinicService } from './clinic/clinic.service';
import { TreatmentController } from './clinic/treatment.controller'; import { TreatmentService } from './clinic/treatment.service';
import { EvolutionController } from './clinic/evolution.controller'; import { EvolutionService } from './clinic/evolution.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), LoggerModule.forRoot({ pinoHttp: { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token', 'req.body', 'res.headers.set-cookie'] } as never })],
  controllers: [HealthController, AuthController, PeopleController, TeamController, SalaController, FinanceController, ClinicController, TreatmentController, EvolutionController], providers: [PrismaService, InternalUserService, AuthService, AuthRateLimitService, AuthSecurityMiddleware, PermissionsGuard, PeopleService, TeamService, FinanceCatalogService, SalaService, ClinicService, TreatmentService, EvolutionService, { provide: APP_FILTER, useClass: HttpExceptionFilter }], exports: [PrismaService, InternalUserService, AuthService, PeopleService, TeamService, SalaService, FinanceCatalogService, ClinicService, TreatmentService, EvolutionService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser(), AuthSecurityMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
