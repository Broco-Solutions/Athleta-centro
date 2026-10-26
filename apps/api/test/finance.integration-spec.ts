import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as XLSX from 'xlsx';
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
  afterEach(async () => { await prisma.salaPaymentReversal.deleteMany(); await prisma.salaPayment.deleteMany(); await prisma.clinicalIncome.deleteMany(); await prisma.person.deleteMany(); await prisma.expense.deleteMany(); await prisma.expenseAreaCatalog.deleteMany({ where: { systemCode: null } }); await prisma.expenseCategory.deleteMany(); await prisma.paymentMethod.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); });
  afterAll(() => app.close());
  async function session(role: Role) { const user = await users.create({ firstName: 'Finance', lastName: 'Tester', email: `${role.toLowerCase()}-${Date.now()}@finance.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('registers an exact Expense idempotently and keeps history when category is retired', async () => {
    const authn = await session(Role.GENERAL_ADMIN); const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf };
    const method = await request(app.getHttpServer()).post('/api/finance/payment-methods').set(headers).send({ name: 'Transferencia' }).expect(201); const category = await request(app.getHttpServer()).post('/api/finance/expense-categories').set(headers).send({ name: 'Insumos' }).expect(201);
    const generalArea = await prisma.expenseAreaCatalog.findUniqueOrThrow({ where: { systemCode: 'GENERAL' } }); const body = { cashDate: '2026-08-31', amount: '999999', categoryId: category.body.data.id, paymentMethodId: method.body.data.id, areaId: generalArea.id, operationId: '11111111-1111-4111-8111-111111111111' };
    const first = await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send(body).expect(201); const second = await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send(body).expect(201); expect(second.body.data.id).toBe(first.body.data.id); expect(await prisma.expense.count()).toBe(1);
    await request(app.getHttpServer()).patch(`/api/finance/expense-categories/${category.body.data.id}`).set(headers).send({ name: 'Insumos', isSelectable: false }).expect(200); await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ ...body, operationId: '22222222-2222-4222-8222-222222222222' }).expect(400);
  });
  it('rejects future dates, non-positive amounts and denies operational history to Kinesiologist', async () => { const authn = await session(Role.KINESIOLOGIST); const method = await prisma.paymentMethod.create({ data: { name: 'Efectivo' } }); const category = await prisma.expenseCategory.create({ data: { name: 'Prueba', normalizedName: 'prueba' } }); const generalArea = await prisma.expenseAreaCatalog.findUniqueOrThrow({ where: { systemCode: 'GENERAL' } }); const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf }; await request(app.getHttpServer()).get('/api/finance/expense-areas').set(headers).expect(200); await request(app.getHttpServer()).post('/api/finance/expense-areas').set(headers).send({ name: 'Sin permiso' }).expect(403); await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2099-01-01', amount: '1', categoryId: category.id, paymentMethodId: method.id, areaId: generalArea.id, operationId: '33333333-3333-4333-8333-333333333333' }).expect(400); await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2026-08-31', amount: '0', categoryId: category.id, paymentMethodId: method.id, areaId: generalArea.id, operationId: '44444444-4444-4444-8444-444444444444' }).expect(400); await request(app.getHttpServer()).get('/api/finance/expenses').set(headers).expect(403); });
  it('manages custom expense areas, keeps linked history and exports filtered descriptions', async () => {
    const authn = await session(Role.GENERAL_ADMIN); const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf };
    const base = await request(app.getHttpServer()).get('/api/finance/expense-areas').set(headers).expect(200);
    expect(base.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Sala', systemCode: 'SALA', isSelectable: true }), expect.objectContaining({ name: 'General', systemCode: 'GENERAL', isSelectable: true })]));
    const created = await request(app.getHttpServer()).post('/api/finance/expense-areas').set(headers).send({ name: '  Kinesiología  ' }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Kinesiología', normalizedName: 'kinesiología', isSelectable: true, systemCode: null });
    await request(app.getHttpServer()).post('/api/finance/expense-areas').set(headers).send({ name: '   ' }).expect(400);
    await request(app.getHttpServer()).post('/api/finance/expense-areas').set(headers).send({ name: 'KINESIOLOGÍA' }).expect(409);
    await request(app.getHttpServer()).patch(`/api/finance/expense-areas/${created.body.data.id}`).set(headers).send({}).expect(400);
    const method = await prisma.paymentMethod.create({ data: { name: 'Transferencia' } });
    const category = await prisma.expenseCategory.create({ data: { name: 'Insumos', normalizedName: 'insumos' } });
    const expense = await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2026-10-01', amount: '12500', categoryId: category.id, paymentMethodId: method.id, areaId: created.body.data.id, description: 'Herramientas', operationId: randomUUID() }).expect(201);
    await request(app.getHttpServer()).patch(`/api/finance/expense-areas/${created.body.data.id}`).set(headers).send({ name: 'Kinesiología y Terapia Manual' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/finance/expense-areas/${created.body.data.id}`).set(headers).send({ isSelectable: false }).expect(200);
    await request(app.getHttpServer()).post('/api/finance/expenses').set(headers).send({ cashDate: '2026-10-02', amount: '100', categoryId: category.id, paymentMethodId: method.id, areaId: created.body.data.id, operationId: randomUUID() }).expect(400);
    const history = await request(app.getHttpServer()).get(`/api/finance/expenses?areaId=${created.body.data.id}`).set(headers).expect(200);
    expect(history.body.data).toEqual([expect.objectContaining({ id: expense.body.data.id, amount: '12500', areaId: created.body.data.id, areaName: 'Kinesiología y Terapia Manual', description: 'Herramientas' })]);
    await request(app.getHttpServer()).patch(`/api/finance/expense-areas/${created.body.data.id}`).set(headers).send({ isSelectable: true }).expect(200);
    const generalArea = await prisma.expenseAreaCatalog.findUniqueOrThrow({ where: { systemCode: 'GENERAL' } });
    await request(app.getHttpServer()).patch(`/api/finance/expense-areas/${generalArea.id}`).set(headers).send({ name: 'Otra' }).expect(400);
    const exported = await request(app.getHttpServer()).get('/api/finance/expenses/export').query({ areaId: created.body.data.id }).set(headers).buffer(true).parse((response: import('node:http').IncomingMessage, callback: (error: Error | null, body?: Buffer) => void) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk))); response.on('end', () => callback(null, Buffer.concat(chunks))); }).expect(200);
    const workbook = XLSX.read(exported.body as Buffer, { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Gastos!, { defval: '' })).toEqual([expect.objectContaining({ Descripción: 'Herramientas', Área: 'Kinesiología y Terapia Manual', Importe: '12500' })]);
  });

  it('excludes reversed Sala payments from income and every financial total without deleting them', async () => {
    const authn = await session(Role.GENERAL_ADMIN);
    const headers = { Cookie: authn.cookie, 'x-csrf-token': authn.csrf };
    const actor = await users.create({ firstName: 'Responsable', lastName: 'Sintético', email: 'actor@finance.test', roles: [Role.ADMINISTRATIVE] });
    const person = await prisma.person.create({ data: { firstName: 'Ingreso', lastName: 'Sintético', dni: '88000003', normalizedDni: '88000003', phone: '3515550000', birthDate: new Date('1990-01-01') } });
    const method = await prisma.paymentMethod.create({ data: { name: 'Efectivo' } });
    const payment = await prisma.salaPayment.create({ data: { personId: person.id, year: 2026, month: 10, coverageStartDate: new Date('2026-10-01'), coverageEndDate: new Date('2026-11-01'), paidAt: new Date('2026-10-01'), amount: 9000, paymentMethodId: method.id, registeredById: actor.id, operationId: randomUUID(), adjustmentReason: 'Descuento' } });
    const income = await request(app.getHttpServer()).get(`/api/finance/income?personId=${person.id}`).set(headers).expect(200);
    expect(income.body.data).toEqual([expect.objectContaining({ id: payment.id, amount: '9000', source: 'SALA' })]);
    expect(income.body.data[0].registeredBy).toEqual({ id: actor.id, firstName: actor.firstName, lastName: actor.lastName });
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

  it('returns only the clinical income registrant identity, independently of the payer and session', async () => {
    const authn = await session(Role.GENERAL_ADMIN);
    const actor = await users.create({ firstName: 'Registro', lastName: 'Clínico', email: 'clinical-actor@finance.test', roles: [Role.KINESIOLOGIST] });
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Sintético', dni: '88000004', normalizedDni: '88000004', phone: '3515550000', birthDate: new Date('1990-01-01') } });
    const method = await prisma.paymentMethod.create({ data: { name: 'Efectivo' } });
    const movement = await prisma.clinicalIncome.create({ data: { personId: person.id, cashDate: new Date('2026-10-01'), amount: 5000, paymentMethodId: method.id, payer: 'PATIENT', registeredById: actor.id, operationId: randomUUID() } });
    const income = await request(app.getHttpServer()).get(`/api/finance/income?personId=${person.id}`).set({ Cookie: authn.cookie }).expect(200);
    expect(income.body.data).toEqual([expect.objectContaining({ id: movement.id, source: 'CLINIC', amount: '5000', person: expect.objectContaining({ id: person.id }) })]);
    expect(income.body.data[0].registeredBy).toEqual({ id: actor.id, firstName: actor.firstName, lastName: actor.lastName });
  });

  it('returns 404 for every clinical API surface while the first delivery flag is disabled', async () => {
    const prior = process.env.ATHLETA_CLINIC_ENABLED;
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    try {
      await request(app.getHttpServer()).get('/api/clinic/appointments').expect(404);
      await request(app.getHttpServer()).get('/api/portal/clinic/appointments').expect(404);
      await request(app.getHttpServer()).get('/api/finance/clinical-incomes').expect(404);
      await request(app.getHttpServer()).get('/api/clinicx/appointments').expect(404);
    } finally {
      if (prior === undefined) delete process.env.ATHLETA_CLINIC_ENABLED;
      else process.env.ATHLETA_CLINIC_ENABLED = prior;
    }
  });

  it('excludes historical clinical movements from first-delivery finance queries and totals', async () => {
    const prior = process.env.ATHLETA_CLINIC_ENABLED;
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    try {
      const authn = await session(Role.GENERAL_ADMIN);
      const actor = await users.create({ firstName: 'Registro', lastName: 'Sintético', email: 'delivery-finance-actor@finance.test', roles: [Role.ADMINISTRATIVE] });
      const person = await prisma.person.create({ data: { firstName: 'Persona', lastName: 'Sintética', dni: '88000005', normalizedDni: '88000005', phone: '3515550000', birthDate: new Date('1990-01-01') } });
      const method = await prisma.paymentMethod.create({ data: { name: 'Transferencia' } });
      const category = await prisma.expenseCategory.create({ data: { name: 'Materiales', normalizedName: 'materiales' } });
      const clinicArea = await prisma.expenseAreaCatalog.findUniqueOrThrow({ where: { systemCode: 'CLINIC' } });
      const generalArea = await prisma.expenseAreaCatalog.findUniqueOrThrow({ where: { systemCode: 'GENERAL' } });
      await prisma.clinicalIncome.create({ data: { personId: person.id, cashDate: new Date('2026-10-01'), amount: 5000, paymentMethodId: method.id, payer: 'PATIENT', registeredById: actor.id, operationId: randomUUID() } });
      await prisma.expense.createMany({ data: [
        { cashDate: new Date('2026-10-01'), amount: 300, categoryId: category.id, paymentMethodId: method.id, areaId: clinicArea.id, operationId: randomUUID(), registeredById: actor.id },
        { cashDate: new Date('2026-10-01'), amount: 200, categoryId: category.id, paymentMethodId: method.id, areaId: generalArea.id, operationId: randomUUID(), registeredById: actor.id },
      ] });
      const headers = { Cookie: authn.cookie };
      await request(app.getHttpServer()).post('/api/finance/expenses').set({ ...headers, 'x-csrf-token': authn.csrf }).send({ cashDate: '2026-10-01', amount: '100', categoryId: category.id, paymentMethodId: method.id, areaId: clinicArea.id, operationId: randomUUID() }).expect(404);
      expect((await request(app.getHttpServer()).get('/api/finance/income?area=CLINIC').set(headers).expect(200)).body.data).toEqual([]);
      expect((await request(app.getHttpServer()).get(`/api/finance/expenses?areaId=${clinicArea.id}`).set(headers).expect(200)).body.data).toEqual([]);
      expect((await request(app.getHttpServer()).get('/api/finance/expenses').set(headers).expect(200)).body.data.map((row: { areaName: string }) => row.areaName)).toEqual(['General']);
      const oldClinicalExpense = await prisma.expense.findFirstOrThrow({ where: { areaId: clinicArea.id } });
      await request(app.getHttpServer()).delete(`/api/finance/expenses/${oldClinicalExpense.id}`).set({ ...headers, 'x-csrf-token': authn.csrf }).expect(404);
      expect(await prisma.expense.count({ where: { areaId: clinicArea.id } })).toBe(1);
      expect((await request(app.getHttpServer()).get('/api/finance/executive-totals').set(headers).expect(200)).body.data).toMatchObject({ clinicalIncome: '0', totalIncome: '0', expenses: '200', net: '-200' });
    } finally {
      if (prior === undefined) delete process.env.ATHLETA_CLINIC_ENABLED;
      else process.env.ATHLETA_CLINIC_ENABLED = prior;
    }
  });

});
