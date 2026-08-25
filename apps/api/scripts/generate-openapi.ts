import { writeFile } from 'node:fs/promises';

async function generate(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://athleta:athleta_local_only@localhost:5432/athleta?schema=public';
  process.env.WEB_ORIGIN ??= 'http://localhost:3000';
  process.env.SESSION_SECRET ??= 'documentation-only-secret-that-is-long-enough';
  const [{ NestFactory }, { RequestMethod }, { DocumentBuilder, SwaggerModule }, { AppModule }] = await Promise.all([
    import('@nestjs/core'), import('@nestjs/common'), import('@nestjs/swagger'), import('../src/app.module.js'),
  ]);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Athleta Manager API').setVersion('0.1.0').build());
  await writeFile('openapi.json', `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}
void generate();
