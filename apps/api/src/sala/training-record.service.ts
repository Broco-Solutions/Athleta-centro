import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type SalaTrainingRecord, type SalaTrainingRecordExercise } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TRAINING_WEIGHT_PATTERN, type CorrectTrainingRecordDto, type CreateTrainingRecordDto, type TrainingRecordQueryDto } from './training-record.dto';

/** DATEs are UTC containers; timestamps must first be converted to the operational date. */
export function trainingOperationalDate(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
const recordInclude = { exercises: { orderBy: { position: 'asc' as const } } };
const summarySelect = { id: true, routineId: true, routineDayId: true, date: true, dayName: true, dayPosition: true, createdAt: true, updatedAt: true } as const;
@Injectable()
export class TrainingRecordService {
  constructor(private readonly prisma: PrismaService) {}
  private today() { return trainingOperationalDate(); }
  async context(personId: string, before = this.today()) {
    const routine = await this.prisma.routine.findFirst({ where: { personId, status: 'ACTIVE' }, include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
    if (!routine) return { today: this.today(), routine: null };
    const ids = [...new Set(routine.days.flatMap(day => day.exercises.map(exercise => exercise.exerciseDefinitionId)))];
    // Bounded by current routine size; each lookup retrieves just one previous weight,
    // across all routine versions. Repeated occurrences stay separate in the form.
    const latest = new Map(await Promise.all(ids.map(async exerciseDefinitionId => {
      const entry = await this.prisma.salaTrainingRecordExercise.findFirst({ where: { exerciseDefinitionId, weightKg: { not: null }, record: { personId, date: { lte: new Date(`${before}T00:00:00Z`) } } }, orderBy: [{ record: { date: 'desc' } }, { record: { createdAt: 'desc' } }, { position: 'desc' }], select: { weightKg: true } });
      return [exerciseDefinitionId, entry?.weightKg?.toString() ?? null] as const;
    })));
    return { today: this.today(), routine: { id: routine.id, createdOn: trainingOperationalDate(routine.createdAt), days: routine.days.map(day => ({ id: day.id, name: day.name, position: day.position, exercises: day.exercises.map(exercise => ({ ...this.snapshot(exercise), id: exercise.id, lastWeightKg: latest.get(exercise.exerciseDefinitionId) ?? null })) })) } };
  }
  async list(personId: string, query: TrainingRecordQueryDto) {
    const { page, pageSize } = query;
    const [records, total] = await this.prisma.$transaction([
      this.prisma.salaTrainingRecord.findMany({ where: { personId }, select: summarySelect, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.salaTrainingRecord.count({ where: { personId } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data: records.map(record => this.summary(record)), meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
  async detail(personId: string, id: string) {
    const record = await this.prisma.salaTrainingRecord.findFirst({ where: { id, personId }, include: recordInclude });
    if (!record) throw this.notFound();
    return this.serialize(record);
  }
  async create(personId: string, input: CreateTrainingRecordDto) {
    this.validateWeights(input, true);
    const date = new Date(`${input.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date || input.date > this.today()) throw new BadRequestException({ code: 'TRAINING_DATE_INVALID', message: 'Elegí una fecha válida que no sea futura.' });
    try {
      return await this.serialized(async tx => {
        // Same lock as routine replacement. The submitted routine ID is never substituted.
        await tx.$queryRaw`SELECT id FROM people WHERE id = ${personId}::uuid FOR UPDATE`;
        const routine = await tx.routine.findFirst({ where: { id: input.routineId, personId, status: 'ACTIVE' }, include: { days: { where: { id: input.routineDayId }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
        if (!routine) throw new ConflictException({ code: 'TRAINING_ROUTINE_CHANGED', message: 'La rutina activa cambió o no está disponible. Revisala antes de registrar.' });
        if (input.date < trainingOperationalDate(routine.createdAt)) throw new BadRequestException({ code: 'TRAINING_BEFORE_ROUTINE', message: 'La fecha es anterior a la asignación de esta rutina.' });
        const day = routine.days[0];
        if (!day) throw new BadRequestException({ code: 'TRAINING_DAY_INVALID', message: 'Ese día no pertenece a tu rutina activa.' });
        this.assertEntries(input, day.exercises.map(exercise => exercise.id));
        const weights = new Map(input.exercises.map(exercise => [exercise.id, exercise.weightKg]));
        const record = await tx.salaTrainingRecord.create({ data: { personId, routineId: routine.id, routineDayId: day.id, date, dayName: day.name, dayPosition: day.position, exercises: { create: day.exercises.map(exercise => ({ ...this.snapshot(exercise), routineExerciseId: exercise.id, weightKg: weights.get(exercise.id) ?? null })) } }, include: recordInclude });
        return this.serialize(record);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.salaTrainingRecord.findUnique({ where: { personId_date_routineDayId: { personId, date, routineDayId: input.routineDayId } }, select: { id: true } });
        throw new ConflictException({ code: 'TRAINING_DUPLICATE', message: 'Ya existe un entrenamiento para esa fecha y día. Podés abrirlo para corregirlo.', details: { recordId: existing?.id } });
      }
      throw error;
    }
  }
  async correct(personId: string, id: string, input: CorrectTrainingRecordDto) {
    this.validateWeights(input);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM sala_training_records WHERE id = ${id}::uuid AND person_id = ${personId}::uuid FOR UPDATE`;
      const record = await tx.salaTrainingRecord.findFirst({ where: { id, personId }, include: recordInclude });
      if (!record) throw this.notFound();
      this.assertEntries(input, record.exercises.map(exercise => exercise.id));
      for (const exercise of input.exercises) await tx.salaTrainingRecordExercise.update({ where: { id: exercise.id }, data: { weightKg: exercise.weightKg } });
      return this.serialize(await tx.salaTrainingRecord.update({ where: { id }, data: { updatedAt: new Date() }, include: recordInclude }));
    });
  }
  private validateWeights(input: CorrectTrainingRecordDto, requireWeight = false) {
    if (!Array.isArray(input.exercises) || !input.exercises.length || input.exercises.some(exercise => exercise.weightKg !== null && (typeof exercise.weightKg !== 'string' || !TRAINING_WEIGHT_PATTERN.test(exercise.weightKg))) || (requireWeight && !input.exercises.some(exercise => exercise.weightKg !== null))) throw new BadRequestException({ code: 'TRAINING_WEIGHTS_INVALID', message: requireWeight ? 'Informá al menos un peso válido en kg, sin valores negativos.' : 'Ingresá pesos válidos en kg, sin valores negativos.' });
  }
  private assertEntries(input: CorrectTrainingRecordDto, ids: string[]) {
    const submitted = new Set(input.exercises.map(exercise => exercise.id));
    if (submitted.size !== input.exercises.length || submitted.size !== ids.length || ids.some(id => !submitted.has(id))) throw new BadRequestException({ code: 'TRAINING_EXERCISES_INVALID', message: 'Los ejercicios no corresponden al día o registro seleccionado. Revisá la rutina.' });
  }
  private snapshot(exercise: { blockPosition: number | null; exerciseDefinitionId: string; exerciseDefinition: { name: string }; position: number; series: string | null; repetitions: string | null; duration: string | null; load: string | null; rest: string | null; notes: string | null }) {
    const { exerciseDefinitionId, position, blockPosition, series, repetitions, duration, load, rest, notes } = exercise;
    return { exerciseDefinitionId, exerciseName: exercise.exerciseDefinition.name, position, blockPosition, series, repetitions, duration, load, rest, notes };
  }
  private summary(record: Pick<SalaTrainingRecord, keyof typeof summarySelect>) { return { id: record.id, routineId: record.routineId, routineDayId: record.routineDayId, dayName: record.dayName, dayPosition: record.dayPosition, date: record.date.toISOString().slice(0, 10), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }; }
  private serialize(record: SalaTrainingRecord & { exercises: SalaTrainingRecordExercise[] }) {
    const summary = this.summary(record);
    return { ...summary, exercises: record.exercises.map(({ recordId: _record, weightKg, ...exercise }) => { void _record; return { ...exercise, weightKg: weightKg?.toString() ?? null }; }) };
  }
  private notFound() { return new NotFoundException({ code: 'TRAINING_NOT_FOUND', message: 'No encontramos ese entrenamiento.' }); }
  private async serialized<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt >= 2) throw new ConflictException({ code: 'TRAINING_CONCURRENT_CHANGE', message: 'La rutina está cambiando. Intentá guardar nuevamente.' });
      }
    }
  }
}
