import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('Finance API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService;
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); });
  afterEach(async () => { await prisma.salaPaymentReversal.deleteMany(); await prisma.salaPayment.deleteMany(); await prisma.person.deleteMany(); await prisma.expense.deleteMany(); await prisma.expenseCategory.deleteMany(); await prisma.paymentMethod.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  afterAll(() => app.close());
  async function session(role: Role) { const user = await users.create({ firstName: 'Finance', lastName: 'Tester', email: `${role.toLowerCase()}-${Date.now()}@finance.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('registers an exact Expense idempotently and keeps history when category is retired', async () => {
    const authn = await session(Role.GENERAL_ADMIN); const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf };
    const method = await request(app.getHttpServer()).post('/api/finance/payment-methods').set(headers).send({ name: 'Transferencia' }).expect(201); const category = await request(app.getHttpServer()).post('/api/finance/expense-categories').set(headers).send({ name: 'Insumos' }).expect(201);
    const body = { cashDate: '2026-08-31', amount: '999999', categoryId: category.body.data.id, paymentMethodId: method.body.data.id, area: 'GENERAL', operationId: '11111111-1111-4111-8111-111111111111' };
    const first = await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send(body).expect(201); const second = await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send(body).expect(201); expect(second.body.data.id).toBe(first.body.data.id); expect(await prisma.expense.count()).toBe(1);
    await request(app.getHttpServer()).patch(`/api/finance/expense-categories/${category.body.data.id}`).set(headers).send({ name: 'Insumos', isSelectable: false }).expect(200); await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ ...body, operationId: '22222222-2222-4222-8222-222222222222' }).expect(400);
  });
  it('rejects future dates, non-positive amounts and denies operational history to Professor', async () => { const authn = await session(Role.PROFESSOR); const method = await prisma.paymentMethod.create({ data: { name: 'Efectivo' } }); const category = await prisma.expenseCategory.create({ data: { name: 'Prueba', normalizedName: 'prueba' } }); const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf }; await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2099-01-01', amount: '1', categoryId: category.id, paymentMethodId: method.id, area: 'GENERAL', operationId: '33333333-3333-4333-8333-333333333333' }).expect(400); await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2026-08-31', amount: '0', categoryId: category.id, paymentMethodId: method.id, area: 'GENERAL', operationId: '44444444-4444-4444-8444-444444444444' }).expect(400); await request(app.getHttpServer()).get('/api/finance/expenses').set(headers).expect(403); });
  it('excludes reversed Sala payments from income and every financial total without deleting them', async () => {
    const authn = await session(Role.GENERAL_ADMIN);
    const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf };
    const actor = await prisma.internalUser.findFirstOrThrow();
    const person = await prisma.person.create({ data: { firstName: 'Ingreso', lastName: 'Sintético', dni: '88000003', normalizedDni: '88000003', phone: '3515550000', birthDate: new Date('1990-01-01') } });
    const method = await prisma.paymentMethod.create({ data: { name: 'Efectivo' } });
    const payment = await prisma.salaPayment.create({ data: { personId: person.id, year: 2026, month: 10, paidAt: new Date('2026-10-01'), amount: 9000, paymentMethodId: method.id, registeredById: actor.id, operationId: randomUUID(), adjustmentReason: 'Descuento' } });
    const income = await request(app.getHttpServer()).get(`/api/finance/income?personId=${person.id}`).set(headers).expect(200);
    expect(income.body.data).toEqual([expect.objectContaining({ id: payment.id, amount: '9000' })]);
    for (const path of ['totals', 'executive-totals']) {
      const result = await request(app.getHttpServer()).get(`/api/finance/${path}`).set(headers).expect(200);
      expect(result.body.data).toMatchObject({ salaIncome: '9000', totalIncome: '9000', ...(path === 'executive-totals' ? { net: '9000' } : {}) });
    }
    await request(app.getHttpServer()).post(`/api/sala/payments/${payment.id}/reverse`).set(headers).send({ reason: 'Cobro duplicado', operationId: randomUUID() }).expect(201);
    expect((await request(app.getHttpServer()).get('/api/finance/income').set(headers).expect(200)).body.data).toEqual([]);
    for (const path of ['totals', 'executive-totals']) {
      const result = await request(app.getHttpServer()).get(`/api/finance/${path}`).set(headers).expect(200);
      expect(result.body.data).toMatchObject({ salaIncome: '0', totalIncome: '0', ...(path === 'executive-totals' ? { net: '0' } : {}) });
    }
    expect(await prisma.salaPayment.findUnique({ where: { id: payment.id }, include: { reversal: true } })).toMatchObject({ adjustmentReason: 'Descuento', reversal: { reason: 'Cobro duplicado' } });
  });

});
