import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClinicalAppointmentStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('Clinic operational appointments API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: InternalUserService;
  let auth: AuthService;
  const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(InternalUserService);
    auth = app.get(AuthService);
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.evolution.deleteMany({ where: { attention: { person: { dni: { startsWith: '56' } } } } });
    await prisma.clinicalAttention.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.clinicalAppointment.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.clinicalPatient.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.person.deleteMany({ where: { dni: { startsWith: '56' } } });
    await prisma.authAttemptBucket.deleteMany();
    await prisma.session.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalCredential.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalUserRole.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalUser.deleteMany({ where: { email: { endsWith: '@clinic-operational.test' } } });
  });

  afterAll(() => app?.close());

  async function session(role: Role) {
    const token = suffix();
    const user = await users.create({ firstName: 'API', lastName: role, email: `${token}@clinic-operational.test`, roles: [role] });
    await auth.provisionCredential(user.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string };
  }

  async function clinicFixture() {
    const token = suffix();
    const professional = await prisma.internalUser.create({
      data: {
        firstName: 'Profesional', lastName: 'Clínico', email: `${token}@clinic-operational.test`, normalizedEmail: `${token}@clinic-operational.test`,
        roles: { create: { role: Role.KINESIOLOGIST } },
      },
    });
    const dni = `56${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Operativo', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    return { professional, person };
  }

  it('allows Administrative to operate safe appointments but never to read clinical history; Professor is forbidden', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const professor = await session(Role.PROFESSOR);
    const { professional, person } = await clinicFixture();
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await request(app.getHttpServer()).get('/api/clinic/professionals').set('Cookie', administrative.cookie).expect(200);
    await request(app.getHttpServer()).get('/api/clinic/professionals').set('Cookie', professor.cookie).expect(403);
    await request(app.getHttpServer()).get('/api/clinic/attentions').set('Cookie', administrative.cookie).expect(403);

    const created = await request(app.getHttpServer())
      .post('/api/clinic/appointments').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ personId: person.id, professionalId: professional.id, startAt: future, durationMinutes: 37, operationalNote: 'Control operativo' })
      .expect(201);
    expect(created.body.data).toMatchObject({ personId: person.id, professionalId: professional.id, durationMinutes: 37, status: 'SCHEDULED', hasAttention: false });
    expect(JSON.stringify(created.body.data)).not.toMatch(/serviceId|fee|charge|evolutionText|consultationReason/i);

    const attended = await request(app.getHttpServer())
      .post(`/api/clinic/appointments/${created.body.data.id}/correct`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ status: 'ATTENDED', coverage: 'PRIVATE' })
      .expect(201);
    expect(attended.body.data).toMatchObject({ status: 'ATTENDED', coverage: 'PRIVATE', hasAttention: true, hasEvolution: false });
    const attention = await prisma.clinicalAttention.findUniqueOrThrow({ where: { appointmentId: created.body.data.id } });
    expect(attention.serviceId).toBeNull();
    expect(await prisma.clinicalCharge.count({ where: { attentionId: attention.id } })).toBe(0);

    const listed = await request(app.getHttpServer())
      .get(`/api/clinic/appointments?from=${encodeURIComponent('2026-01-01T03:00:00.000Z')}&to=${encodeURIComponent('2030-01-01T03:00:00.000Z')}`)
      .set('Cookie', administrative.cookie)
      .expect(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.data.id, status: ClinicalAppointmentStatus.ATTENDED, coverage: 'PRIVATE' })]));
    expect(JSON.stringify(listed.body.data)).not.toMatch(/serviceId|fee|charge|evolutionText|consultationReason|bodyAreaOrInjury/i);
  });
});
