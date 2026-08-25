import request from 'supertest';
import { Test } from '@nestjs/testing';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] }); await app.init(); });
  afterAll(async () => app.close());
  it('returns its liveness status without the API prefix', async () => { await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' }); });
});
