import { routineAllowsMonth, routineForDate, routinePresentation } from './routine-periods';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type SalaTrainingRecord, type SalaTrainingRecordExercise } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TRAINING_WEIGHT_PATTERN, type SaveMonthlyTrainingWeightsDto, type CorrectTrainingRecordDto, type CreateTrainingRecordDto, type TrainingRecordQueryDto } from './training-record.dto';

/** DATEs are UTC containers; timestamps must first be converted to the operational date. */
export function trainingOperationalDate(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
const recordInclude = { exercises: { orderBy: { position: 'asc' as const } } };
const summarySelect = { id: true, routineId: true, routineDayId: true, date: true, month: true, weekNumber: true, dayName: true, dayPosition: true, createdAt: true, updatedAt: true } as const;
@Injectable()
export class TrainingRecordService {
  constructor(private readonly prisma: PrismaService) {}
  private today() { return trainingOperationalDate(); }
  async context(personId: string, before = this.today()) {
    const today = this.today();
    const versions = await this.prisma.routine.findMany({ where: { personId }, orderBy: [{ createdAt: 'asc' }, { version: 'asc' }], include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
    const routines = routinePresentation(versions, today).map(routine => ({ id: routine.id, version: routine.version, status: routine.status, createdOn: trainingOperationalDate(routine.createdAt), effectiveFrom: routine.effectiveFrom, effectiveUntil: routine.effectiveUntil, days: routine.days.map(day => ({ id: day.id, name: day.name, position: day.position, exercises: day.exercises.map(exercise => ({ ...this.snapshot(exercise), id: exercise.id })) })) }));
    const routine = routineForDate(versions, today);
    if (!routine) return { today, routine: null, routines };
    const ids = [...new Set(routine.days.flatMap(day => day.exercises.map(exercise => exercise.exerciseDefinitionId)))];
    // Repeated occurrences share a previous weight reference, while their input fields remain independent.
    const latest = new Map(await Promise.all(ids.map(async exerciseDefinitionId => {
      const entries = await this.prisma.salaTrainingRecordExercise.findMany({ where: { exerciseDefinitionId, weightKg: { not: null }, record: { personId, OR: [{ date: { lte: new Date(`${before}T00:00:00Z`) } }, { month: { lte: before.slice(0, 7) } }] } }, include: { record: { select: { date: true, month: true, weekNumber: true, createdAt: true } } } });
      entries.sort((a, b) => {
        const period = (entry: typeof a) => entry.record.month ?? entry.record.date!.toISOString().slice(0, 7);
        return period(b).localeCompare(period(a)) || (b.record.weekNumber ?? 0) - (a.record.weekNumber ?? 0) || (b.record.date?.getTime() ?? 0) - (a.record.date?.getTime() ?? 0) || b.record.createdAt.getTime() - a.record.createdAt.getTime();
      });
      const entry = entries[0];
      return [exerciseDefinitionId, entry?.weightKg?.toString() ?? null] as const;
    })));
    return { today, routines, routine: { id: routine.id, createdOn: trainingOperationalDate(routine.createdAt), effectiveFrom: routine.effectiveFrom.toISOString().slice(0, 10), days: routine.days.map(day => ({ id: day.id, name: day.name, position: day.position, exercises: day.exercises.map(exercise => ({ ...this.snapshot(exercise), id: exercise.id, lastWeightKg: latest.get(exercise.exerciseDefinitionId) ?? null })) })) } };
  }
  async list(personId: string, query: TrainingRecordQueryDto) {
    const { page, pageSize } = query;
    const [records, total] = await this.prisma.$transaction([
      this.prisma.salaTrainingRecord.findMany({ where: { personId }, select: summarySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.salaTrainingRecord.count({ where: { personId } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data: records.map(record => this.summary(record)), meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
  async listMonth(personId: string, month: string) {
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException({ code: 'TRAINING_MONTH_INVALID', message: 'Elegí un mes válido.' });
    }
    // Training dates are PostgreSQL DATEs, represented as UTC containers, not instants.
    // Monthly identity is independent of legacy date references.
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const records = await this.prisma.salaTrainingRecord.findMany({
      where: { personId, OR: [{ month }, { date: { gte: start, lt: end } }] },
      include: recordInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map(record => this.serialize(record));
  }
  async detail(personId: string, id: string) {
    const record = await this.prisma.salaTrainingRecord.findFirst({ where: { id, personId }, include: recordInclude });
    if (!record) throw this.notFound();
    return this.serialize(record);
  }
  async create(personId: string, input: CreateTrainingRecordDto) {
    this.validateWeights(input, true);
    const date = new Date(`${input.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date || (input.date > this.today() && input.allowFuture !== true)) throw new BadRequestException({ code: 'TRAINING_DATE_INVALID', message: 'Elegí una fecha válida.' });
    const weekStart = new Date(date);
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const duplicateWhere = { personId, routineId: input.routineId, routineDayId: input.routineDayId, date: { gte: weekStart, lt: weekEnd } };
    const duplicateOrder = [{ date: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];
    const duplicateError = (recordId?: string) => new ConflictException({ code: 'TRAINING_DUPLICATE', message: 'Ya existe un entrenamiento para esa semana y día. Podés abrirlo para corregirlo.', details: { recordId } });
    try {
      return await this.serialized(async tx => {
        // Same lock as routine replacement. The submitted routine ID is never substituted.
        await tx.$queryRaw`SELECT id FROM people WHERE id = ${personId}::uuid FOR UPDATE`;
        const routine = await tx.routine.findFirst({ where: { id: input.routineId, personId }, include: { days: { where: { id: input.routineDayId }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
        if (!routine || (input.allowFuture !== true && routine.effectiveFrom.toISOString().slice(0, 10) > this.today())) throw new ConflictException({ code: 'TRAINING_ROUTINE_CHANGED', message: 'La rutina activa cambió o no está disponible. Revisala antes de registrar.' });
        if (input.allowFuture !== true && input.date < routine.effectiveFrom.toISOString().slice(0, 10)) throw new BadRequestException({ code: 'TRAINING_BEFORE_ROUTINE', message: 'La fecha es anterior a la asignación de esta rutina.' });
        // Weekly references must lie in this version's portion of the week. Only
        // the first assignment extends backwards for retrospective entry.
        const versions = await tx.routine.findMany({ where: { personId }, orderBy: [{ effectiveFrom: 'asc' }, { version: 'asc' }], select: { id: true, effectiveFrom: true } });
        if (input.allowFuture !== true && routineForDate(versions.map((v, i) => ({ ...v, version: i })), this.today())?.id !== routine.id) throw new ConflictException({ code: 'TRAINING_ROUTINE_CHANGED', message: 'La rutina vigente cambió. Revisala antes de registrar.' });
        const index = versions.findIndex(version => version.id === routine.id);
        const next = versions[index + 1];
        if ((index > 0 && input.date < routine.effectiveFrom.toISOString().slice(0, 10)) ||
            (next && input.date >= next.effectiveFrom.toISOString().slice(0, 10)) ||
            (input.allowFuture !== true && routineForDate(versions.map((v, i) => ({ ...v, version: i })), this.today())?.id !== routine.id)) {
          throw new BadRequestException({ code: 'TRAINING_ROUTINE_PERIOD_INVALID', message: 'La fecha de referencia no corresponde al período de esta rutina.' });
        }
        const day = routine.days[0];
        if (!day) throw new BadRequestException({ code: 'TRAINING_DAY_INVALID', message: 'Ese día no pertenece a tu rutina activa.' });
        this.assertEntries(input, day.exercises.map(exercise => exercise.id));
        const duplicate = await tx.salaTrainingRecord.findFirst({ where: duplicateWhere, orderBy: duplicateOrder, select: { id: true } });
        if (duplicate) throw duplicateError(duplicate.id);
        const weights = new Map(input.exercises.map(exercise => [exercise.id, exercise.weightKg]));
        const record = await tx.salaTrainingRecord.create({ data: { personId, routineId: routine.id, routineDayId: day.id, date, dayName: day.name, dayPosition: day.position, exercises: { create: day.exercises.map(exercise => ({ ...this.snapshot(exercise), routineExerciseId: exercise.id, weightKg: weights.get(exercise.id) ?? null })) } }, include: recordInclude });
        return this.serialize(record);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.salaTrainingRecord.findFirst({ where: duplicateWhere, orderBy: duplicateOrder, select: { id: true } });
        throw duplicateError(existing?.id);
      }
      throw error;
    }
  }
  async saveMonthlyWeights(personId: string, input: SaveMonthlyTrainingWeightsDto) {
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new BadRequestException({ code: 'TRAINING_MONTH_INVALID', message: 'Elegí un mes válido.' });
    if (!Array.isArray(input.weeks) || input.weeks.length !== 6 || new Set(input.weeks.map(w => w.weekNumber)).size !== 6 || input.weeks.some(w => !Number.isInteger(w.weekNumber) || w.weekNumber < 1 || w.weekNumber > 6)) throw new BadRequestException({ code: 'TRAINING_WEEKS_INVALID', message: 'Informá las seis semanas, sin repetirlas.' });
    input.weeks.forEach(week => this.validateWeights(week));
    try {
      return await this.serialized(async tx => {
        await tx.$queryRaw`SELECT id FROM people WHERE id = ${personId}::uuid FOR UPDATE`;
        const versions = await tx.routine.findMany({ where: { personId } });
        if (!routineAllowsMonth(versions, input.routineId, input.month)) throw new BadRequestException({ code: 'TRAINING_ROUTINE_PERIOD_INVALID', message: 'El mes no corresponde al período de esta rutina.' });
        const routine = await tx.routine.findFirst({ where: { id: input.routineId, personId }, include: { days: { where: { id: input.routineDayId }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
        const day = routine?.days[0];
        if (!day) throw new BadRequestException({ code: 'TRAINING_DAY_INVALID', message: 'Ese día no pertenece a tu rutina.' });
        input.weeks.forEach(week => this.assertEntries(week, day.exercises.map(e => e.id)));
        const where = { personId, routineId: input.routineId, routineDayId: input.routineDayId, month: input.month };
        const existing = await tx.salaTrainingRecord.findMany({ where, include: recordInclude });
        for (const week of input.weeks) {
          const weights = new Map(week.exercises.map(e => [e.id, e.weightKg === null ? null : new Prisma.Decimal(e.weightKg.replace(',', '.'))]));
          const record = existing.find(r => r.weekNumber === week.weekNumber);
          if (!record) {
            if ([...weights.values()].every(w => w === null)) continue;
            await tx.salaTrainingRecord.create({ data: { ...where, date: null, weekNumber: week.weekNumber, dayName: day.name, dayPosition: day.position, exercises: { create: day.exercises.map(e => ({ ...this.snapshot(e), routineExerciseId: e.id, weightKg: weights.get(e.id) ?? null })) } } });
          } else {
            let changed = false;
            for (const entry of record.exercises) {
              if (!weights.has(entry.routineExerciseId)) continue;
              const value = weights.get(entry.routineExerciseId) ?? null;
              if (value === null ? entry.weightKg === null : entry.weightKg?.equals(value)) continue;
              await tx.salaTrainingRecordExercise.update({ where: { id: entry.id }, data: { weightKg: value } });
              changed = true;
            }
            if (changed) await tx.salaTrainingRecord.update({ where: { id: record.id }, data: { updatedAt: new Date() } });
          }
        }
        return (await tx.salaTrainingRecord.findMany({ where, include: recordInclude, orderBy: { weekNumber: 'asc' } })).map(record => this.serialize(record));
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'TRAINING_DUPLICATE', message: 'Ya existe un registro para esa semana y día.' });
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
  private summary(record: Pick<SalaTrainingRecord, keyof typeof summarySelect>) { return { id: record.id, routineId: record.routineId, routineDayId: record.routineDayId, dayName: record.dayName, dayPosition: record.dayPosition, date: record.date?.toISOString().slice(0, 10) ?? null, month: record.month, weekNumber: record.weekNumber, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }; }
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
