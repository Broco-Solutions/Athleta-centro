import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/request-id.middleware';
import { configuredWebOrigin } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.enableCors({ origin: configuredWebOrigin(), credentials: true, methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`Athleta API listening on 0.0.0.0:${port}`);
}
void bootstrap();
