import { CreatePersonDto, PersonResponseDto } from '../people/person.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { SalaOccurrenceStatus, SalaScheduleExceptionType, SalaWeekday } from '@prisma/client';

export class CapacityDto { @ApiProperty({ type: Number, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) capacity!: number; }
export class UpdateSalaConfigurationDto extends CapacityDto {}
export class PlanDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() monthlyAmount!: number;
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, uniqueItems: true })
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID(undefined, { each: true }) serviceTypeIds!: string[];
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() isSelectable?: boolean;
}

export class SalaServiceTypeDto { @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(120) name!: string; @ApiProperty({ type: Number, minimum: 15, multipleOf: 15 }) @Type(() => Number) @IsInt() @Min(15) durationMinutes!: number; @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() isSelectable?: boolean; }
export class ScheduleSlotDto { @ApiProperty({ enum: SalaWeekday, type: String }) @IsEnum(SalaWeekday) weekday!: SalaWeekday; @ApiProperty({ example: '09:00', type: String }) @IsString() startTime!: string; @ApiPropertyOptional({ minimum: 1, type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes = 60; @ApiPropertyOptional({ minimum: 1, nullable: true, type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) specificCapacity?: number | null; }
export class ReplaceWeeklyScheduleDto { @ApiProperty({ type: () => [ScheduleSlotDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ScheduleSlotDto) windows!: ScheduleSlotDto[]; }
export class ReplaceScheduleSlotDto { @ApiProperty({ enum: SalaWeekday, type: String }) @IsEnum(SalaWeekday) weekday!: SalaWeekday; @ApiProperty({ example: '09:00', type: String }) @IsString() startTime!: string; @ApiPropertyOptional({ minimum: 1, type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes = 60; @ApiPropertyOptional({ minimum: 1, nullable: true, type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) specificCapacity?: number | null; @ApiProperty({ format: 'date', type: String }) @IsDateString({ strict: true }) effectiveDate!: string; }
export class ScheduleExceptionDto { @ApiProperty({ format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiProperty({ enum: SalaScheduleExceptionType }) @IsEnum(SalaScheduleExceptionType) type!: SalaScheduleExceptionType; @ApiPropertyOptional({ minimum: 1, nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacityOverride?: number | null; }
export class JoinSalaDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() mainProfessorId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() planId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) startDate!: string; }
export class ChangeProfessorDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() mainProfessorId!: string; }
export class ChangePlanDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() planId!: string; }
export class FixedBookingDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid', description: 'Weekly opening window' }) @IsUUID() scheduleSlotId!: string; @ApiProperty({ type: String, format: 'uuid', required: true }) @IsUUID() serviceTypeId?: string; @ApiProperty({ type: String, example: '12:00', pattern: '^([01]\\d|2[0-3]):(00|30)$', required: true }) @Matches(/^([01]\d|2[0-3]):(00|30)$/) startTime?: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) startDate!: string; @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) @IsOptional() @IsDateString({ strict: true }) endDate?: string | null; @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() confirmOverbooking?: boolean; }
export class OneOffReservationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid', description: 'Weekly opening window' }) @IsUUID() scheduleSlotId!: string; @ApiProperty({ type: String, format: 'uuid', required: true }) @IsUUID() serviceTypeId?: string; @ApiProperty({ type: String, example: '12:00', pattern: '^([01]\\d|2[0-3]):(00|30)$', required: true }) @Matches(/^([01]\d|2[0-3]):(00|30)$/) startTime?: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() confirmOverbooking?: boolean; }
export class ChangeFixedBookingDto extends FixedBookingDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() id!: string; }
export class EndFixedBookingDto { @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) endDate!: string; }
export class OccurrenceReferenceDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() scheduleSlotId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiPropertyOptional({ type: String, example: '09:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string; @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() sourceId?: string; }
export class SpontaneousOccurrenceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() scheduleSlotId!: string;
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() serviceTypeId!: string;
  @ApiProperty({ type: String, example: '10:30', pattern: '^([01]\\d|2[0-3]):(00|15|30|45)$' }) @Matches(/^([01]\d|2[0-3]):(00|15|30|45)$/) startTime!: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() confirmOverbooking?: boolean;
}
export class JoinSpontaneousSalaDto extends SpontaneousOccurrenceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() planId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() mainProfessorId!: string;
}
export class SpontaneousOptionsQueryDto {
  @ApiProperty({ type: String, format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date!: string;
}
export class SpontaneousPlanOptionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class SpontaneousServiceOptionDto extends SpontaneousPlanOptionDto {
  @ApiProperty({ type: Number }) durationMinutes!: number;
}

export class OccurrenceCorrectionDto extends OccurrenceReferenceDto { @ApiProperty({ enum: SalaOccurrenceStatus, type: String }) @IsEnum(SalaOccurrenceStatus) status!: SalaOccurrenceStatus; }
export class SalaAgendaPersonDto { @ApiProperty({ type: String, format: 'uuid' }) id!: string; @ApiProperty({ type: String }) firstName!: string; @ApiProperty({ type: String }) lastName!: string; @ApiProperty({ type: String }) dni!: string; }
export class SalaAgendaProfessionalDto { @ApiProperty({ type: String, format: 'uuid' }) id!: string; @ApiProperty({ type: String }) firstName!: string; @ApiProperty({ type: String }) lastName!: string; }
export class SalaAgendaServiceDto { @ApiProperty({ type: String }) name!: string; }
export class SalaAgendaEntryDto { @ApiProperty({ type: String, format: 'uuid' }) personId!: string; @ApiProperty({ type: () => SalaAgendaPersonDto }) person!: SalaAgendaPersonDto; @ApiProperty({ enum: ['FIXED', 'ONE_OFF', 'SPONTANEOUS'], type: String }) origin!: string; @ApiProperty({ enum: [...Object.values(SalaOccurrenceStatus), 'PENDING_PAYMENT'], type: String }) status!: SalaOccurrenceStatus | 'PENDING_PAYMENT'; @ApiProperty({ type: Boolean }) isMaterialized!: boolean; @ApiPropertyOptional({ type: Boolean }) cancelledForNonPayment?: boolean; @ApiProperty({ type: String, format: 'uuid' }) sourceId!: string; @ApiProperty({ type: String, example: '09:00' }) startTime!: string; @ApiProperty({ type: Number, minimum: 15, multipleOf: 15 }) durationMinutes!: number; @ApiPropertyOptional({ type: () => SalaAgendaProfessionalDto, nullable: true }) professional?: SalaAgendaProfessionalDto | null; @ApiPropertyOptional({ type: () => SalaAgendaServiceDto, nullable: true }) service?: SalaAgendaServiceDto | null; }
export class SalaAgendaSlotDto { @ApiProperty({ type: String, description: 'Derived 15-minute slot identifier' }) id!: string; @ApiProperty({ type: String, format: 'uuid' }) scheduleSlotId!: string; @ApiProperty({ type: String }) weekday!: string; @ApiProperty({ type: String, example: '12:00' }) startTime!: string; @ApiProperty({ type: Number, enum: [15] }) durationMinutes!: number; }
export class SalaAgendaGroupDto { @ApiProperty({ type: () => SalaAgendaSlotDto }) slot!: SalaAgendaSlotDto; @ApiProperty({ type: Number }) capacity!: number; @ApiProperty({ type: Number }) reserved!: number; @ApiProperty({ type: Number }) available!: number; @ApiProperty({ type: Boolean }) isOverbooked!: boolean; @ApiProperty({ type: Boolean }) isClosed!: boolean; @ApiProperty({ type: () => [SalaAgendaEntryDto] }) people!: SalaAgendaEntryDto[]; }
export class SalaAgendaResponseDto { @ApiProperty({ type: [SalaAgendaGroupDto] }) data!: SalaAgendaGroupDto[]; }
export class ExerciseDefinitionDto {
  @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) primaryMuscle!: string;
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}
export class RetireExerciseDefinitionDto {
  @ApiPropertyOptional({ type: Boolean, default: false }) @IsOptional() @IsBoolean() confirmActiveRoutineImpact = false;
}
export class RoutineExerciseDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() exerciseDefinitionId!: string;
  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true }) @IsOptional() @IsString() @MaxLength(80) series?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true }) @IsOptional() @IsString() @MaxLength(80) repetitions?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true }) @IsOptional() @IsString() @MaxLength(80) duration?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true }) @IsOptional() @IsString() @MaxLength(80) load?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true }) @IsOptional() @IsString() @MaxLength(80) rest?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}
export class RoutineDayDto {
  @ApiPropertyOptional({ type: String, maxLength: 120, nullable: true }) @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @ApiProperty({ type: () => [RoutineExerciseDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => RoutineExerciseDto) exercises!: RoutineExerciseDto[];
}
export class RoutineTemplateDto {
  @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ type: () => [RoutineDayDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => RoutineDayDto) days!: RoutineDayDto[];
}
export class ReplaceRoutineDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string;
  @ApiProperty({ type: () => [RoutineDayDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => RoutineDayDto) days!: RoutineDayDto[];
}
export class PhysicalTestDefinitionDto { @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) name!: string; @ApiProperty({ type: String, maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) type!: string; @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string | null; }
export class PhysicalTestResultDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() testDefinitionId!: string; @ApiProperty({ type: String, maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) resultText!: string; }
export class PhysicalEvaluationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professorId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) evaluationDate!: string; @ApiProperty({ type: () => [PhysicalTestResultDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => PhysicalTestResultDto) results!: PhysicalTestResultDto[]; }
export class SalaPaymentAllocationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() chargeId!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; }
export class SalaPlanPaymentPeriodDto {
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() year!: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 12 }) @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string;
}
export class RegisterSalaPlanPaymentsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: () => [SalaPlanPaymentPeriodDto], minItems: 1 }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalaPlanPaymentPeriodDto) periods!: SalaPlanPaymentPeriodDto[];
  @ApiProperty({ type: String, format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) paidAt!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() paymentMethodId!: string;
}
export class SalaPaymentDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() year!: number; @ApiProperty({ type: Number, minimum: 1, maximum: 12 }) @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) paidAt!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() paymentMethodId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(300) adjustmentReason?: string; @ApiPropertyOptional({ type: () => [SalaPaymentAllocationDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SalaPaymentAllocationDto) allocations?: SalaPaymentAllocationDto[]; }
export class FinancialReasonDto { @ApiProperty({ type: String, maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) reason!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; }
export class SalaChargeAdjustmentDto extends FinancialReasonDto { @ApiProperty({ type: String, pattern: '^-?\\d+$' }) @IsString() @Matches(/^-?\d+$/) amount!: string; }
export class SalaOpeningBalanceDto extends FinancialReasonDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) chargeDate!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiPropertyOptional({ type: String, maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) concept?: string; }
export class ActivateSalaBillingDto { @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) cutoverDate!: string; }

export class CreateSalaStudentDto extends CreatePersonDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() mainProfessorId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() planId!: string;
}
export class SalaProfessorOptionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
}
export class SalaProfessorListEnvelopeDto {
  @ApiProperty({ type: () => [SalaProfessorOptionDto] }) data!: SalaProfessorOptionDto[];
}

export class CreateSpontaneousSalaStudentDto extends IntersectionType(
  CreateSalaStudentDto,
  PickType(SpontaneousOccurrenceDto, ['scheduleSlotId', 'serviceTypeId', 'startTime', 'date', 'confirmOverbooking'] as const),
) {}
export class SpontaneousOptionsDto {
  @ApiProperty({ type: Boolean }) eligible!: boolean;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) participationId?: string;
  @ApiPropertyOptional({ type: () => SpontaneousPlanOptionDto }) plan?: SpontaneousPlanOptionDto;
  @ApiPropertyOptional({ type: () => SalaProfessorOptionDto }) mainProfessor?: SalaProfessorOptionDto;
  @ApiProperty({ type: () => [SpontaneousServiceOptionDto] }) services!: SpontaneousServiceOptionDto[];
}
export class SpontaneousOptionsEnvelopeDto { @ApiProperty({ type: () => SpontaneousOptionsDto }) data!: SpontaneousOptionsDto; }
export class SpontaneousStudentResponseDto {
  @ApiProperty({ type: () => PersonResponseDto }) person!: PersonResponseDto;
  @ApiProperty({ type: Object }) occurrence!: object;
}
export class SpontaneousStudentEnvelopeDto { @ApiProperty({ type: () => SpontaneousStudentResponseDto }) data!: SpontaneousStudentResponseDto; }
