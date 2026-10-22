import { createHash, randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { HealthDeclarationService } from '../src/sala/health-declaration/health-declaration.service';
import { HEALTH_CONSENT_KEYS, currentHealthDocument, type HealthDocument } from '../src/sala/health-declaration/health-document';
import type { SubmitHealthDeclarationDto } from '../src/sala/health-declaration/health-declaration.dto';

// Synthetic test content verifies mechanics only. These strings are never published as legal text.
const testDocument: HealthDocument = {
  version: 'SYNTHETIC-TEST-ONLY', questions: [{ id: 'testQuestion', category: 'Synthetic category', text: 'Synthetic test question' }],
  consents: HEALTH_CONSENT_KEYS.map(key => ({ key, text: `Synthetic test consent ${key}` })),
  guardianConfirmation: 'Synthetic test guardian confirmation', finalConfirmation: 'Synthetic test final confirmation',
};
const payload = (): SubmitHealthDeclarationDto => ({ documentVersion: testDocument.version, personal: { emergencyContactName: 'Contacto sintético', emergencyContactPhone: '0000000000' }, activity: {}, kinesiology: {}, answers: {}, consents: { physicalActivity: true, truthfulness: true, emergenciesAndPrivacy: true, healthDataProcessing: false, kinesiology: false, manualEvaluation: false, therapeuticExercise: false, manualTherapy: false, physicalAgents: false, dryNeedling: false, taping: false, shareWithDoctors: false, shareWithClubs: false, clinicalImage: false, institutionalImage: false }, confirmed: true });

describe('Health declaration onboarding and privacy', () => {
  let app: INestApplication; let prisma: PrismaService; let health: HealthDeclarationService;
  let personId: string; let dni: string; let cookie: string; let csrf: string; let professorId: string; let planId: string;
  const userIds: string[] = [];
  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init();
    prisma = app.get(PrismaService); health = app.get(HealthDeclarationService);
    const professor = await app.get(InternalUserService).create({ firstName: 'Salud', lastName: 'Profesor sintético', email: `health-${randomUUID()}@test.local`, roles: [Role.PROFESSOR] });
    professorId = professor.id; userIds.push(professorId);
    planId = (await prisma.salaPlan.create({ data: { name: `Salud ${randomUUID()}`, monthlyAmount: 1000 } })).id;
  });
  beforeEach(async () => {
    dni = String(Math.floor(10000000 + Math.random() * 80000000));
    const person = await prisma.person.create({ data: { firstName: 'Alumno', lastName: 'Sintético salud', dni, normalizedDni: dni, phone: '0000000000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111'), mustChangePin: false } }, salaParticipations: { create: { mainProfessorId: professorId, planId, startDate: new Date('2020-01-01') } } } });
    personId = person.id;
    const login = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni, pin: '1111' }).expect(200);
    cookie = login.headers['set-cookie'][0].split(';')[0]; csrf = login.body.data.csrfToken;
    jest.spyOn(health, 'document').mockReturnValue(testDocument);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.healthDeclaration.deleteMany({ where: { personId } });
    await prisma.session.deleteMany({ where: { personId } });
    await prisma.salaParticipation.deleteMany({ where: { personId } });
    await prisma.portalCredential.deleteMany({ where: { personId } });
    await prisma.person.delete({ where: { id: personId } });
  });
  afterAll(async () => {
    await prisma.salaPlan.delete({ where: { id: planId } });
    await prisma.session.deleteMany({ where: { internalUserId: { in: userIds } } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: { in: userIds } } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: { in: userIds } } });
    await prisma.internalUser.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });
  function submit(body: unknown = payload(), token = csrf) { return request(app.getHttpServer()).post('/api/portal/health-declarations/submit').set('Cookie', cookie).set('x-csrf-token', token).send(body); }
  async function internalCookie(role: Role) {
    const user = await app.get(InternalUserService).create({ firstName: 'Salud', lastName: `Sintético ${role}`, email: `health-${randomUUID()}@test.local`, roles: [role] }); userIds.push(user.id);
    await prisma.internalCredential.upsert({ where: { internalUserId: user.id }, create: { internalUserId: user.id, passwordHash: await argon2.hash('Synthetic-test-password1!'), mustChangePassword: false }, update: { mustChangePassword: false } });
    const token = randomUUID();
    await prisma.session.create({ data: { kind: 'INTERNAL', internalUserId: user.id, secretHash: createHash('sha256').update(token).digest('hex'), csrfToken: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    return `athleta_session=${token}`;
  }
  it('blocks existing students without a declaration on every usual portal operation and permits profile/logout', async () => {
    const session = await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', cookie).expect(200);
    expect(session.body.data.healthDeclaration).toMatchObject({ status: 'MISSING', required: true });
    for (const path of ['sala', 'sala/services', 'sala/availability?date=2026-10-22', 'sala/fixed-bookings', 'clinic/appointments']) {
      const result = await request(app.getHttpServer()).get(`/api/portal/${path}`).set('Cookie', cookie).expect(403);
      expect(result.body.code).toBe('PORTAL_HEALTH_DECLARATION_REQUIRED');
    }
    const mutation = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', cookie).set('x-csrf-token', csrf).send({ date: '2026-10-22', scheduleSlotId: randomUUID() }).expect(403);
    expect(mutation.body.code).toBe('PORTAL_HEALTH_DECLARATION_REQUIRED');
    await request(app.getHttpServer()).get('/api/portal/me').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).post('/api/portal/auth/logout').set('Cookie', cookie).expect(200);
  });
  it('prioritizes mandatory PIN change then requires the declaration', async () => {
    await prisma.portalCredential.update({ where: { personId }, data: { mustChangePin: true } });
    expect((await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(403)).body.code).toBe('PORTAL_PIN_CHANGE_REQUIRED');
    expect((await submit().expect(403)).body.code).toBe('PORTAL_PIN_CHANGE_REQUIRED');
    await request(app.getHttpServer()).post('/api/portal/auth/change-pin').set('Cookie', cookie).set('x-csrf-token', csrf).send({ currentPin: '1111', nextPin: '2222' }).expect(200);
    expect((await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(403)).body.code).toBe('PORTAL_HEALTH_DECLARATION_REQUIRED');
    await submit().expect(201);
    await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(200);
  });
  it('accepts blank optional fields and all optional authorizations rejected, saves once and survives logout', async () => {
    const result = await submit().expect(201);
    expect(result.body.data).toMatchObject({ status: 'CURRENT', required: false });
    const row = await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } });
    expect(row.consents).toEqual(payload().consents); expect(row.documentVersion).toBe(testDocument.version);
    expect(row.answers).toMatchObject({ kinesiology: {}, answers: {}, personal: payload().personal });
    expect(Object.keys(row.identity as object).sort()).toEqual(['birthDate', 'confirmed', 'declarant', 'dni', 'firstName', 'lastName', 'phone']);
    expect(row.identity).toMatchObject({ confirmed: true, dni, declarant: { name: 'Alumno Sintético salud', dni } });
    expect(row.validUntil.getUTCFullYear()).toBe(row.submittedAt.getUTCFullYear() + 1);
    await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).post('/api/portal/auth/logout').set('Cookie', cookie).expect(200);
    const login = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni, pin: '1111' }).expect(200);
    cookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', cookie).expect(200)).body.data.healthDeclaration.status).toBe('CURRENT');
    await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(200);
  });
  it('rejects missing required data, optional undecided choices, missing confirmation, unknown fields and invalid CSRF without persistence', async () => {
    await submit(payload(), 'invalid').expect(403);
    const noContact = payload(); noContact.personal.emergencyContactName = ' ';
    await submit(noContact).expect(400);
    const noConsent = payload(); noConsent.consents.physicalActivity = false;
    await submit(noConsent).expect(400);
    const noConfirmation = payload(); noConfirmation.confirmed = false;
    await submit(noConfirmation).expect(400);
    await submit({ ...payload(), personId: randomUUID() }).expect(400);
    const undecided = payload(); delete (undecided.consents as Partial<typeof undecided.consents>).clinicalImage;
    await submit(undecided).expect(400);
    expect(await prisma.healthDeclaration.count({ where: { personId } })).toBe(0);
  });
  it('requires guardian identification and express confirmation for minors', async () => {
    await prisma.person.update({ where: { id: personId }, data: { birthDate: new Date('2015-01-01') } });
    expect((await submit().expect(400)).body.code).toBe('HEALTH_GUARDIAN_REQUIRED');
    expect(await prisma.healthDeclaration.count({ where: { personId } })).toBe(0);
    const data = payload(); data.personal = { ...data.personal, guardianName: 'Tutor sintético', guardianDni: '00000001', guardianConfirmed: true };
    await submit(data).expect(201);
    expect((await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } })).identity).toMatchObject({ declarant: { name: 'Tutor sintético', dni: '00000001' } });
  });
  it('does not persist medical data without consent and preserves it when authorized', async () => {
    const data = payload(); data.answers = { testQuestion: { answer: 'YES', details: 'Dato médico sintético' } }; data.kinesiology = { reason: 'Motivo sintético' };
    expect((await submit(data).expect(400)).body.code).toBe('HEALTH_PROCESSING_CONSENT_REQUIRED');
    expect(await prisma.healthDeclaration.count({ where: { personId } })).toBe(0);
    data.consents.healthDataProcessing = true;
    await submit(data).expect(201);
    expect((await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } })).answers).toMatchObject({ answers: data.answers, kinesiology: data.kinesiology });
  });
  it('renews expired declarations, preserves history and prevents overwrites in PostgreSQL', async () => {
    await submit().expect(201);
    const first = await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } });
    await submit().expect(201); // Voluntary update while still current.
    expect(await prisma.healthDeclaration.count({ where: { personId } })).toBe(2);
    expect(await prisma.healthDeclaration.findUnique({ where: { id: first.id } })).toEqual(first);
    await expect(prisma.healthDeclaration.update({ where: { id: first.id }, data: { documentVersion: 'overwritten' } })).rejects.toThrow();
    expect((await prisma.healthDeclaration.findUniqueOrThrow({ where: { id: first.id } })).documentVersion).toBe(first.documentVersion);
    // Expiration uses current time; a stored historical submission stays intact.
    await prisma.healthDeclaration.deleteMany({ where: { personId } });
    const expired = await prisma.healthDeclaration.create({ data: { personId, submittedAt: new Date('2020-01-01'), validUntil: new Date('2021-01-01'), documentVersion: first.documentVersion, identity: first.identity!, answers: first.answers!, consents: first.consents!, document: first.document! } });
    expect((await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', cookie).expect(200)).body.data.healthDeclaration).toMatchObject({ status: 'EXPIRED', required: true });
    await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(403);
    await submit().expect(201);
    expect(await prisma.healthDeclaration.findUnique({ where: { id: expired.id } })).toEqual(expired);
    expect((await request(app.getHttpServer()).get('/api/portal/health-declarations').set('Cookie', cookie).expect(200)).body.data).toHaveLength(2);
  });
  it('returns only status/dates to Administrative and full declarations to authorized Professor/General Admin', async () => {
    await submit().expect(201); const row = await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } });
    const administrative = await internalCookie(Role.ADMINISTRATIVE);
    const status = await request(app.getHttpServer()).get(`/api/sala/people/${personId}/health-declaration/status`).set('Cookie', administrative).expect(200);
    expect(Object.keys(status.body.data.latest).sort()).toEqual(['documentVersion', 'id', 'submittedAt', 'validUntil']);
    await request(app.getHttpServer()).get(`/api/sala/people/${personId}/health-declarations/${row.id}`).set('Cookie', administrative).expect(403);
    await request(app.getHttpServer()).get(`/api/sala/people/${personId}/health-declarations`).set('Cookie', administrative).expect(200);
    for (const role of [Role.PROFESSOR, Role.GENERAL_ADMIN]) {
      const allowed = await internalCookie(role);
      const detail = await request(app.getHttpServer()).get(`/api/sala/people/${personId}/health-declarations/${row.id}`).set('Cookie', allowed).expect(200);
      expect(detail.body.data.personal.emergencyContactName).toBe(payload().personal.emergencyContactName);
    }
    await request(app.getHttpServer()).get(`/api/sala/people/${personId}/health-declarations/${row.id}`).set('Cookie', cookie).expect(401);
  });
  it('rejects declaration access belonging to another student, including with a forged person query', async () => {
    await submit().expect(201); const row = await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } });
    await request(app.getHttpServer()).get(`/api/portal/health-declarations/${row.id}?personId=${randomUUID()}`).set('Cookie', cookie).expect(200); // Query cannot change session ownership.
    await expect(health.detail(randomUUID(), row.id)).rejects.toThrow('Declaración no encontrada.');
    const otherToken = randomUUID(); const otherDni = `9${dni}`;
    const other = await prisma.person.create({ data: { firstName: 'Otro', lastName: 'Sintético', dni: otherDni, normalizedDni: otherDni, birthDate: new Date('1990-01-01'), phone: '0000000000' } });
    await prisma.session.create({ data: { personId: other.id, kind: 'PORTAL', secretHash: createHash('sha256').update(otherToken).digest('hex'), csrfToken: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    try { await request(app.getHttpServer()).get(`/api/portal/health-declarations/${row.id}?personId=${personId}`).set('Cookie', `athleta_portal_session=${otherToken}`).expect(404); } finally { await prisma.session.deleteMany({ where: { personId: other.id } }); await prisma.person.delete({ where: { id: other.id } }); }
  });
  it('accepts the actual client document and stores its exact source/version and individual procedure decisions', async () => {
    jest.restoreAllMocks();
    const document = currentHealthDocument()!;
    const data = payload(); data.documentVersion = document.version;
    await submit(data).expect(201);
    const record = await prisma.healthDeclaration.findFirstOrThrow({ where: { personId } });
    expect(record.document).toMatchObject({ sourceSha256: document.sourceSha256, questions: document.questions });
    expect(record.consents).toMatchObject({ dryNeedling: false, manualTherapy: false, clinicalImage: false });
    expect((await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', cookie).expect(200)).body.data.healthDeclaration.required).toBe(false);
  });
  it('rejects unavailable or stale source documents and preserves mandatory onboarding', async () => {
    const old = payload(); old.documentVersion = 'old-version'; await submit(old).expect(409);
    jest.spyOn(health, 'document').mockReturnValue(null);
    expect((await submit().expect(503)).body.code).toBe('HEALTH_DOCUMENT_UNAVAILABLE');
    expect((await request(app.getHttpServer()).get('/api/portal/auth/session').set('Cookie', cookie).expect(200)).body.data.healthDeclaration).toMatchObject({ required: true, documentAvailable: false });
    await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', cookie).expect(403);
    expect(await prisma.healthDeclaration.count({ where: { personId } })).toBe(0);
  });
});
