import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type HealthDeclaration } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { currentHealthDocument, declarationValidUntil, ageOnDate, HEALTH_CONSENT_KEYS, HEALTH_DATA_CONTROLLER, operationalToday } from './health-document';
import type { SubmitHealthDeclarationDto, HealthDeclarationStatusDto, HealthDeclarationSummaryDto, HealthDeclarationDetailDto } from './health-declaration.dto';
const optionalText = z.string().trim().max(300).optional();
const inputSchema = z.strictObject({
  documentVersion: z.string().min(1).max(100),
  personal: z.strictObject({
    emergencyContactName: z.string().trim().min(1).max(200), emergencyContactPhone: z.string().trim().min(1).max(80).regex(/^[+\d\s().-]+$/),
    address: optionalText, locality: optionalText, occupation: optionalText, socialWork: optionalText,
    affiliateNumber: optionalText, primaryDoctor: optionalText,
    guardianName: optionalText, guardianDni: optionalText, guardianConfirmed: z.boolean().optional(),
  }),
  activity: z.strictObject({ practice: z.enum(['YES', 'NO', 'NOT_DISCLOSED']).optional(), sport: optionalText, frequency: optionalText, club: optionalText, level: optionalText }),
  kinesiology: z.strictObject({ reason: optionalText, affectedArea: optionalText, pain: z.string().refine(value => value === '' || (/^\d+(\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 10)).optional(), diagnosis: optionalText, referral: optionalText, studies: optionalText }),
  answers: z.record(z.string().max(100), z.strictObject({ answer: z.enum(['YES', 'NO', 'NOT_DISCLOSED']), details: z.string().trim().max(2000).optional() })),
  consents: z.strictObject({ physicalActivity: z.literal(true), truthfulness: z.literal(true), emergenciesAndPrivacy: z.literal(true), healthDataProcessing: z.literal(true), kinesiology: z.boolean().optional().default(false), manualEvaluation: z.boolean().optional().default(false), therapeuticExercise: z.boolean().optional().default(false), manualTherapy: z.boolean().optional().default(false), physicalAgents: z.boolean().optional().default(false), dryNeedling: z.boolean().optional().default(false), taping: z.boolean().optional().default(false), shareWithDoctors: z.boolean(), shareWithClubs: z.boolean(), clinicalImage: z.boolean(), institutionalImage: z.boolean() }),
  confirmed: z.literal(true),
});
@Injectable()
export class HealthDeclarationService {
  constructor(private readonly prisma: PrismaService) {}
  document() { return currentHealthDocument(); }
  formDocument() { const document = this.document(); return document ? { ...document, dataController: HEALTH_DATA_CONTROLLER } : null; }
  async status(personId: string, client: Prisma.TransactionClient = this.prisma): Promise<HealthDeclarationStatusDto> {
    // Expiry, not administrative insertion time, determines which evidence is relevant.
    const [digital, paper] = await Promise.all([
      client.healthDeclaration.findFirst({ where: { personId }, orderBy: [{ validUntil: 'desc' }, { id: 'desc' }], select: { id: true, submittedAt: true, validUntil: true, documentVersion: true } }),
      client.paperHealthDeclaration.findFirst({ where: { personId }, orderBy: [{ validUntil: 'desc' }, { id: 'desc' }], select: { id: true, signedOn: true, validUntil: true } }),
    ]);
    const digitalCurrent = digital !== null && digital.validUntil > new Date();
    const paperCurrent = paper !== null && paper.validUntil.toISOString().slice(0, 10) >= operationalToday();
    const latest = digitalCurrent ? this.summary(digital!) : paperCurrent ? this.paperSummary(paper!) :
      paper && (!digital || paper.validUntil >= digital.validUntil) ? this.paperSummary(paper) : digital ? this.summary(digital) : null;
    const status = digitalCurrent || paperCurrent ? 'CURRENT' : latest ? 'EXPIRED' : 'MISSING';
    return { status, documentAvailable: this.document() !== null, required: status !== 'CURRENT', latest };
  }
  async history(personId: string, includeRegistrar = false): Promise<HealthDeclarationSummaryDto[]> {
    const [digital, paper] = await Promise.all([
      this.prisma.healthDeclaration.findMany({ where: { personId }, select: { id: true, submittedAt: true, validUntil: true, documentVersion: true } }),
      this.prisma.paperHealthDeclaration.findMany({ where: { personId }, select: { id: true, signedOn: true, validUntil: true, ...(includeRegistrar ? { registeredAt: true, registeredBy: true, registrar: { select: { firstName: true, lastName: true } } } : {}) } }),
    ]);
    return [...digital.map(item => this.summary(item)), ...paper.map(item => this.paperSummary(item))].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
  }
  private paperSummary(row: { id: string; signedOn: Date; validUntil: Date; registeredAt?: Date; registeredBy?: string; registrar?: { firstName: string; lastName: string } }): HealthDeclarationSummaryDto {
    return { id: row.id, origin: 'PAPER', signedOn: row.signedOn.toISOString().slice(0, 10), submittedAt: row.signedOn.toISOString().slice(0, 10), validUntil: row.validUntil.toISOString().slice(0, 10), ...(row.registeredAt ? { registeredAt: row.registeredAt.toISOString(), ...(row.registeredBy ? { registeredBy: row.registeredBy } : {}), ...(row.registrar ? { registeredByName: `${row.registrar.firstName} ${row.registrar.lastName}` } : {}) } : {}) };
  }
  private async lockPerson(tx: Prisma.TransactionClient, personId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM people WHERE id = ${personId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Persona no encontrada.' });
  }
  private async assertNoCurrent(tx: Prisma.TransactionClient, personId: string) {
    await this.lockPerson(tx, personId);
    if (!(await this.status(personId, tx)).required) throw new ConflictException({ code: 'HEALTH_DECLARATION_CURRENT', message: 'Tu declaración de salud continúa vigente. Podrás completar una nueva cuando venza la actual.' });
  }
  async registerPaper(personId: string, signedOn: string, actorId: string) {
    await this.prisma.$transaction(tx => this.registerPaperWithinTransaction(tx, personId, signedOn, actorId));
    return this.status(personId);
  }
  async registerPaperWithinTransaction(tx: Prisma.TransactionClient, personId: string, signedOn: string, actorId: string) {
    const parsed = z.iso.date().safeParse(signedOn);
    if (!parsed.success || signedOn > operationalToday()) throw new BadRequestException({ code: 'HEALTH_PAPER_SIGNATURE_DATE_INVALID', message: 'Ingresá la fecha real de firma, sin fechas futuras.' });
    await this.assertNoCurrent(tx, personId);
    const date = new Date(`${signedOn}T00:00:00.000Z`);
    if (await tx.paperHealthDeclaration.findFirst({ where: { personId, signedOn: date }, select: { id: true } })) throw new ConflictException({ code: 'HEALTH_PAPER_ALREADY_REGISTERED', message: 'La declaración firmada en esa fecha ya fue registrada.' });
    return tx.paperHealthDeclaration.create({ data: { personId, signedOn: date, validUntil: declarationValidUntil(date), registeredBy: actorId } });
  }
  async detail(personId: string, id: string): Promise<HealthDeclarationDetailDto> {
    const declaration = await this.prisma.healthDeclaration.findFirst({ where: { id, personId } });
    if (!declaration) throw new NotFoundException({ code: 'HEALTH_DECLARATION_NOT_FOUND', message: 'Declaración no encontrada.' });
    const snapshot = declaration.answers as unknown as Pick<HealthDeclarationDetailDto, 'personal' | 'activity' | 'kinesiology' | 'answers'>;
    return { ...this.summary(declaration), identity: declaration.identity as Record<string, unknown>, personal: snapshot.personal, activity: snapshot.activity, kinesiology: snapshot.kinesiology, answers: snapshot.answers, consents: declaration.consents as unknown as HealthDeclarationDetailDto['consents'], document: declaration.document as Record<string, unknown> };
  }
  // Person comes from the authenticated Portal session; snapshot only the explicit identity fields.
  async submit(person: { id: string; firstName: string; lastName: string; dni: string; birthDate: Date; phone: string }, input: SubmitHealthDeclarationDto): Promise<HealthDeclarationSummaryDto> {
    const personId = person.id;
    const document = this.document();
    if (!document) throw new ServiceUnavailableException({ code: 'HEALTH_DOCUMENT_UNAVAILABLE', message: 'La declaración está pendiente del documento fuente de Athleta.' });
    // The catalog must contain every consent; incomplete source content can never enable submissions.
    if (!document.version.trim() || !document.finalConfirmation.trim() || !document.guardianConfirmation.trim() || !document.questions.length || HEALTH_CONSENT_KEYS.some(key => !document.consents.some(item => item.key === key && item.text.trim()))) {
      throw new ServiceUnavailableException({ code: 'HEALTH_DOCUMENT_UNAVAILABLE', message: 'El documento fuente está incompleto.' });
    }
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: 'HEALTH_DECLARATION_INVALID', message: 'Revisá los campos obligatorios y las confirmaciones.', details: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: 'Respuesta inválida.' })) });
    const data = parsed.data;
    if (data.documentVersion !== document.version) throw new ConflictException({ code: 'HEALTH_DOCUMENT_VERSION_CHANGED', message: 'El documento cambió. Volvé a revisar los consentimientos.' });
    if (Object.keys(data.answers).some(id => !document.questions.some(question => question.id === id))) throw new BadRequestException({ code: 'HEALTH_ANSWER_UNKNOWN', message: 'La respuesta no pertenece al documento vigente.' });
    const categories = new Map<string, typeof document.questions>();
    for (const question of document.questions) categories.set(question.category, [...(categories.get(question.category) ?? []), question]);
    for (const questions of categories.values()) {
      const choices = questions.filter(question => question.responseType !== 'TEXT');
      const required = choices.length ? choices : questions;
      const responses = required.map(question => data.answers[question.id]?.answer);
      if (!responses.every(answer => answer === 'NOT_DISCLOSED') && !responses.every(answer => answer === 'YES' || answer === 'NO')) {
        throw new BadRequestException({ code: 'HEALTH_CATEGORY_REQUIRED', message: 'Respondé cada categoría de antecedentes.', details: { category: required[0]!.category } });
      }
    }
    const row = await this.prisma.$transaction(async tx => {
      await this.assertNoCurrent(tx, personId);
      const submittedAt = new Date();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(submittedAt);
      const birthDate = person.birthDate.toISOString().slice(0, 10);
      if (ageOnDate(birthDate, today) < 18 && (!data.personal.guardianName?.trim() || !data.personal.guardianDni?.trim() || !data.personal.guardianConfirmed)) throw new BadRequestException({ code: 'HEALTH_GUARDIAN_REQUIRED', message: 'Se requiere la identificación y confirmación del responsable del menor.' });
      // Do not retain irrelevant hidden details or a guardian for an adult.
      if (ageOnDate(birthDate, today) >= 18) { delete data.personal.guardianName; delete data.personal.guardianDni; delete data.personal.guardianConfirmed; }
      if (data.activity.practice !== 'YES') { delete data.activity.sport; delete data.activity.frequency; delete data.activity.club; delete data.activity.level; }
      for (const answer of Object.values(data.answers)) if (answer.answer !== 'YES') delete answer.details;
      const answers = { personal: data.personal, activity: data.activity, kinesiology: data.consents.healthDataProcessing ? data.kinesiology : {}, answers: data.consents.healthDataProcessing ? data.answers : {} };
      return tx.healthDeclaration.create({ data: {
        personId, submittedAt, validUntil: declarationValidUntil(submittedAt), documentVersion: document.version,
        identity: { firstName: person.firstName, lastName: person.lastName, dni: person.dni, phone: person.phone, birthDate, confirmed: data.confirmed, declarant: ageOnDate(birthDate, today) < 18 ? { name: data.personal.guardianName!, dni: data.personal.guardianDni! } : { name: `${person.firstName} ${person.lastName}`, dni: person.dni } },
        answers: answers as Prisma.InputJsonObject, consents: data.consents, document: { ...document, dataController: HEALTH_DATA_CONTROLLER } as Prisma.InputJsonObject,
      } });
    });
    return this.summary(row);
  }
  private summary(row: Pick<HealthDeclaration, 'id' | 'submittedAt' | 'validUntil' | 'documentVersion'>): HealthDeclarationSummaryDto {
    return { origin: 'DIGITAL', id: row.id, submittedAt: row.submittedAt.toISOString(), validUntil: row.validUntil.toISOString(), documentVersion: row.documentVersion };
  }
}
