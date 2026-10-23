import { CreatePersonDto, PersonResponseDto } from '../people/person.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { SalaOccurrenceStatus, SalaScheduleExceptionType, SalaWeekday } from '@prisma/client';

export class CapacityDto { @ApiProperty({ type: Number, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) capacity!: number; }
export class UpdateSalaConfigurationDto extends CapacityDto {}
export class PlanDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() monthlyAmount!: number;
  @ApiProperty({ type: Number, minimum: 2, maximum: 5 }) @Type(() => Number) @IsInt() @Min(2) @Max(5) weeklySessions!: number;
  @ApiPropertyOptional({ type: [String], format: 'uuid', uniqueItems: true })
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID(undefined, { each: true }) serviceTypeIds?: string[];
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
export class FixedBookingDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid', description: 'Weekly opening window' }) @IsUUID() scheduleSlotId!: string; @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() serviceTypeId?: string; @ApiProperty({ type: String, example: '12:00', pattern: '^([01]\\d|2[0-3]):00$', required: true }) @Matches(/^([01]\d|2[0-3]):00$/) startTime?: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) startDate!: string; @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) @IsOptional() @IsDateString({ strict: true }) endDate?: string | null; @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() confirmOverbooking?: boolean; }
export class OneOffReservationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid', description: 'Weekly opening window' }) @IsUUID() scheduleSlotId!: string; @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() serviceTypeId?: string; @ApiProperty({ type: String, example: '12:00', pattern: '^([01]\\d|2[0-3]):00$', required: true }) @Matches(/^([01]\d|2[0-3]):00$/) startTime?: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() confirmOverbooking?: boolean; }
export class ChangeFixedBookingDto extends FixedBookingDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() id!: string; }
export class EndFixedBookingDto { @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) endDate!: string; }
export class OccurrenceReferenceDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() scheduleSlotId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiPropertyOptional({ type: String, example: '09:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string; @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() sourceId?: string; }
export class CheckInByDniDto { @ApiProperty({ type: String, example: '30123456' }) @IsString() @Matches(/^\d{7,8}$/) dni!: string; }
export class CheckInResultDto { @ApiProperty({ type: String }) status!: string; @ApiProperty({ type: String }) message!: string; @ApiPropertyOptional({ type: String }) person?: string; @ApiPropertyOptional({ type: String }) startTime?: string; @ApiPropertyOptional({ type: String, nullable: true }) validUntil?: string | null; @ApiPropertyOptional({ type: String, nullable: true }) renewalMessage?: string | null; }
export class CheckInResultEnvelopeDto { @ApiProperty({ type: () => CheckInResultDto }) data!: CheckInResultDto; }
export class SpontaneousOccurrenceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() scheduleSlotId!: string;
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() serviceTypeId?: string;
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
export class SalaDashboardQueryDto {
  @ApiProperty({ type: String, format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date!: string;
}
export class SalaDashboardPersonDto extends SalaAgendaProfessionalDto {
  @ApiProperty({ type: String, enum: ['FIXED', 'ONE_OFF'] }) origin!: 'FIXED' | 'ONE_OFF';
}
export class SalaDashboardUpcomingDto {
  @ApiProperty({ type: String, example: '09:00' }) startTime!: string;
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: () => [SalaDashboardPersonDto], maxItems: 3 }) people!: SalaDashboardPersonDto[];
}
export class SalaDashboardFollowUpDto {
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: [String], format: 'uuid' }) personIds!: string[];
}
export class SalaDashboardDto {
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty({ type: Number }) expected!: number;
  @ApiProperty({ type: Number }) attended!: number;
  @ApiProperty({ type: Number }) cancelledOrAbsent!: number;
  @ApiProperty({ type: () => [SalaDashboardUpcomingDto], maxItems: 3 }) upcoming!: SalaDashboardUpcomingDto[];
  @ApiProperty({ type: () => SalaDashboardFollowUpDto }) withoutRoutine!: SalaDashboardFollowUpDto;
  @ApiProperty({ type: () => SalaDashboardFollowUpDto }) withoutValidity!: SalaDashboardFollowUpDto;
}
export class SalaDashboardEnvelopeDto {
  @ApiProperty({ type: () => SalaDashboardDto }) data!: SalaDashboardDto;
}
export class SalaAgendaResponseDto { @ApiProperty({ type: [SalaAgendaGroupDto] }) data!: SalaAgendaGroupDto[]; }
export class ExerciseDefinitionDto {
  @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiPropertyOptional({ type: String, maxLength: 120, nullable: true }) @IsOptional() @IsString() @MaxLength(120) primaryMuscle?: string | null;
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
export class PhysicalTestDefinitionDto { @ApiProperty({ type: String, maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) name!: string; @ApiPropertyOptional({ enum: ['STRENGTH', 'MOBILITY', 'OTHER'], nullable: true }) @IsOptional() @IsString() type?: 'STRENGTH' | 'MOBILITY' | 'OTHER' | null; @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string | null; }
export class PhysicalTestResultDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() testDefinitionId!: string; @ApiProperty({ type: String, maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) resultText!: string; }
export class PhysicalEvaluationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() salaParticipationId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professorId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) evaluationDate!: string; @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() observation?: string | null; @ApiProperty({ type: () => [PhysicalTestResultDto], minItems: 1 }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PhysicalTestResultDto) results!: PhysicalTestResultDto[]; }
export class SalaPaymentAllocationDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() chargeId!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; }
export class SalaPaymentDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() planId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) paidAt!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() paymentMethodId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(300) adjustmentReason?: string; @ApiPropertyOptional({ type: () => [SalaPaymentAllocationDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SalaPaymentAllocationDto) allocations?: SalaPaymentAllocationDto[]; }
export class FinancialReasonDto { @ApiProperty({ type: String, maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) reason!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() operationId!: string; }
export class SalaChargeAdjustmentDto extends FinancialReasonDto { @ApiProperty({ type: String, pattern: '^-?\\d+$' }) @IsString() @Matches(/^-?\d+$/) amount!: string; }
export class SalaOpeningBalanceDto extends FinancialReasonDto { @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) chargeDate!: string; @ApiProperty({ type: String, pattern: '^\\d+$' }) @IsString() @Matches(/^\d+$/) amount!: string; @ApiPropertyOptional({ type: String, maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) concept?: string; }

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

export class SalaStudentPlanDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class SalaStudentListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) participationId!: string;
  @ApiProperty({ type: String, format: 'date' }) participationStartDate!: string;
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) dni!: string;
  @ApiProperty({ type: () => SalaStudentPlanDto }) plan!: SalaStudentPlanDto;
  @ApiProperty({ type: () => SalaAgendaProfessionalDto }) professor!: SalaAgendaProfessionalDto;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'MISSING'] }) routineStatus!: 'ACTIVE' | 'MISSING';
  @ApiProperty({ type: Boolean }) hasValidAccess!: boolean;
  @ApiProperty({ type: String, format: 'date', nullable: true }) validUntil!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) lastPaymentPaidAt!: string | null;
}
export class SalaStudentListEnvelopeDto {
  @ApiProperty({ type: () => [SalaStudentListItemDto] }) data!: SalaStudentListItemDto[];
}

export class UpdateSalaObjectiveDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) objective?: string | null;
}
export class SalaObjectiveDto {
  @ApiProperty({ type: String, nullable: true, maxLength: 500 }) objective!: string | null;
}
export class SalaObjectiveEnvelopeDto { @ApiProperty({ type: () => SalaObjectiveDto }) data!: SalaObjectiveDto; }
export class SalaLeaveImpactDto {
  @ApiProperty({ type: Number, minimum: 0 }) fixedBookings!: number;
  @ApiProperty({ type: Number, minimum: 0 }) futureReservations!: number;
  @ApiProperty({ type: Number, minimum: 0 }) activeRoutines!: number;
  @ApiProperty({ type: Number, minimum: 0 }) activeClinicalIndications!: number;
}
export class SalaLeaveImpactEnvelopeDto { @ApiProperty({ type: () => SalaLeaveImpactDto }) data!: SalaLeaveImpactDto; }
export class BulkLeaveSalaDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) participationIds!: string[];
}
export class BulkChangeProfessorDto extends BulkLeaveSalaDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() mainProfessorId!: string;
}
export class BulkSalaActionResultDto { @ApiProperty({ type: Number, minimum: 0 }) affected!: number; }
export class BulkSalaActionEnvelopeDto { @ApiProperty({ type: () => BulkSalaActionResultDto }) data!: BulkSalaActionResultDto; }

export class CorrectPhysicalEvaluationDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() observation?: string | null;
  @ApiProperty({ type: () => [PhysicalTestResultDto], minItems: 1 }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PhysicalTestResultDto) results!: PhysicalTestResultDto[];
}
export class PhysicalTestDefinitionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, nullable: true }) type!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: Boolean }) isActive!: boolean;
}
export class PhysicalTestDefinitionEnvelopeDto { @ApiProperty({ type: () => PhysicalTestDefinitionResponseDto }) data!: PhysicalTestDefinitionResponseDto; }
export class PhysicalTestDefinitionListEnvelopeDto { @ApiProperty({ type: () => [PhysicalTestDefinitionResponseDto] }) data!: PhysicalTestDefinitionResponseDto[]; }
export class PhysicalTestResultResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) testDefinitionId!: string;
  @ApiProperty({ type: String }) resultText!: string;
  @ApiProperty({ type: () => PhysicalTestDefinitionResponseDto }) testDefinition!: PhysicalTestDefinitionResponseDto;
}
export class PhysicalEvaluationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) salaParticipationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) professorId!: string;
  @ApiProperty({ type: String, format: 'date' }) evaluationDate!: string;
  @ApiProperty({ type: String, nullable: true }) observation!: string | null;
  @ApiProperty({ type: () => SalaProfessorOptionDto }) professor!: SalaProfessorOptionDto;
  @ApiProperty({ type: () => [PhysicalTestResultResponseDto] }) results!: PhysicalTestResultResponseDto[];
}
export class PhysicalEvaluationEnvelopeDto { @ApiProperty({ type: () => PhysicalEvaluationResponseDto }) data!: PhysicalEvaluationResponseDto; }
export class PhysicalEvaluationListEnvelopeDto { @ApiProperty({ type: () => [PhysicalEvaluationResponseDto] }) data!: PhysicalEvaluationResponseDto[]; }

export class ExerciseDefinitionResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, nullable: true }) primaryMuscle!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: Boolean }) isActive!: boolean;
}
export class ExerciseDefinitionEnvelopeDto {
  @ApiProperty({ type: () => ExerciseDefinitionResponseDto }) data!: ExerciseDefinitionResponseDto;
}
export class ExerciseDefinitionListEnvelopeDto {
  @ApiProperty({ type: () => [ExerciseDefinitionResponseDto] }) data!: ExerciseDefinitionResponseDto[];
}
export class RoutineExerciseResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: String }) exerciseDefinitionId!: string;
  @ApiProperty({ type: String, nullable: true }) series!: string | null;
  @ApiProperty({ type: String, nullable: true }) repetitions!: string | null;
  @ApiProperty({ type: String, nullable: true }) duration!: string | null;
  @ApiProperty({ type: String, nullable: true }) load!: string | null;
  @ApiProperty({ type: String, nullable: true }) rest!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: () => ExerciseDefinitionResponseDto }) exerciseDefinition!: ExerciseDefinitionResponseDto;
}
export class RoutineDayResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: () => [RoutineExerciseResponseDto] }) exercises!: RoutineExerciseResponseDto[];
}
export class RoutineTemplateResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: () => [RoutineDayResponseDto] }) days!: RoutineDayResponseDto[];
}
export class RoutineTemplateListEnvelopeDto {
  @ApiProperty({ type: () => [RoutineTemplateResponseDto] }) data!: RoutineTemplateResponseDto[];
}
export class SalaRoutineResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) personId!: string;
  @ApiProperty({ type: String }) salaParticipationId!: string;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'HISTORICAL'] }) status!: 'ACTIVE' | 'HISTORICAL';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: () => [RoutineDayResponseDto] }) days!: RoutineDayResponseDto[];
}
export class SalaRoutineListEnvelopeDto {
  @ApiProperty({ type: () => [SalaRoutineResponseDto] }) data!: SalaRoutineResponseDto[];
}
export class SalaParticipationPlanResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number, nullable: true }) weeklySessions!: number | null;
  @ApiProperty({ type: String }) monthlyAmount!: string;
}
export class SalaParticipationResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) personId!: string;
  @ApiProperty({ type: String }) startDate!: string;
  @ApiProperty({ type: String, nullable: true }) endDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) objective!: string | null;
  @ApiProperty({ type: String }) mainProfessorId!: string;
  @ApiProperty({ type: String }) planId!: string;
  @ApiProperty({ type: () => SalaParticipationPlanResponseDto }) plan!: SalaParticipationPlanResponseDto;
  @ApiProperty({ type: () => SalaProfessorOptionDto }) mainProfessor!: SalaProfessorOptionDto;
}
export class SalaParticipationListEnvelopeDto {
  @ApiProperty({ type: () => [SalaParticipationResponseDto] }) data!: SalaParticipationResponseDto[];
}
export class SalaBookingSlotResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) weekday!: string;
  @ApiProperty({ type: String }) startTime!: string;
  @ApiProperty({ type: Number }) durationMinutes!: number;
}
export class SalaBookingServiceResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) durationMinutes!: number;
}
export class FixedSalaBookingResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) personId!: string;
  @ApiProperty({ type: String }) salaParticipationId!: string;
  @ApiProperty({ type: String, nullable: true }) startTime!: string | null;
  @ApiProperty({ type: () => SalaBookingSlotResponseDto }) scheduleSlot!: SalaBookingSlotResponseDto;
  @ApiProperty({ type: () => SalaBookingServiceResponseDto, nullable: true }) serviceType!: SalaBookingServiceResponseDto | null;
  @ApiProperty({ type: String }) startDate!: string;
  @ApiProperty({ type: String, nullable: true }) endDate!: string | null;
}
export class FixedSalaBookingListEnvelopeDto {
  @ApiProperty({ type: () => [FixedSalaBookingResponseDto] }) data!: FixedSalaBookingResponseDto[];
}
export class SalaReservationResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) personId!: string;
  @ApiProperty({ type: String }) salaParticipationId!: string;
  @ApiProperty({ type: String, nullable: true }) startTime!: string | null;
  @ApiProperty({ type: () => SalaBookingSlotResponseDto }) scheduleSlot!: SalaBookingSlotResponseDto;
  @ApiProperty({ type: () => SalaBookingServiceResponseDto, nullable: true }) serviceType!: SalaBookingServiceResponseDto | null;
  @ApiProperty({ type: String }) date!: string;
  @ApiProperty({ type: String, nullable: true }) cancelledAt!: string | null;
}
export class SalaReservationListEnvelopeDto {
  @ApiProperty({ type: () => [SalaReservationResponseDto] }) data!: SalaReservationResponseDto[];
}
export class SalaAvailabilityResponseDto {
  @ApiProperty({ type: String }) slotId!: string;
  @ApiProperty({ type: String }) scheduleSlotId!: string;
  @ApiProperty({ type: String }) startTime!: string;
  @ApiProperty({ type: String }) endTime!: string;
  @ApiProperty({ type: String }) date!: string;
  @ApiProperty({ type: Number }) capacity!: number;
  @ApiProperty({ type: Number }) reserved!: number;
  @ApiProperty({ type: Number }) available!: number;
  @ApiProperty({ type: Boolean }) isOverbooked!: boolean;
  @ApiProperty({ type: Boolean }) isClosed!: boolean;
}
export class SalaAvailabilityListEnvelopeDto {
  @ApiProperty({ type: () => [SalaAvailabilityResponseDto] }) data!: SalaAvailabilityResponseDto[];
}
export class SalaPaymentMethodResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Boolean }) isSelectable!: boolean;
}
export class SalaPaymentActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
}
export class SalaPaymentReversalResponseDto {
  @ApiProperty({ type: () => SalaPaymentActorDto }) registeredBy!: SalaPaymentActorDto;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) reason!: string;
}
export class SalaPaymentResponseDto {
  @ApiProperty({ type: () => SalaPaymentActorDto }) registeredBy!: SalaPaymentActorDto;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) coverageStartDate!: string;
  @ApiProperty({ type: String, format: 'date' }) coverageEndDate!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) planId!: string | null;
  @ApiProperty({ type: String, nullable: true }) planName!: string | null;
  @ApiProperty({ type: String }) paidAt!: string;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty({ type: String, nullable: true }) adjustmentReason!: string | null;
  @ApiProperty({ type: () => SalaPaymentMethodResponseDto }) paymentMethod!: SalaPaymentMethodResponseDto;
  @ApiProperty({ type: () => SalaPaymentReversalResponseDto, nullable: true }) reversal!: SalaPaymentReversalResponseDto | null;
}
export class SalaPaymentEnvelopeDto {
  @ApiProperty({ type: () => SalaPaymentResponseDto }) data!: SalaPaymentResponseDto;
}
export class SalaPaymentListEnvelopeDto {
  @ApiProperty({ type: () => [SalaPaymentResponseDto] }) data!: SalaPaymentResponseDto[];
}
