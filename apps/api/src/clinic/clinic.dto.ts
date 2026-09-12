import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClinicalAppointmentStatus,
  ClinicalTestResponseType,
  TrainingCondition,
  TreatmentFinishReason,
} from '@prisma/client';

const ARS_PATTERN = /^(0|[1-9]\d*)$/;

export class PatientDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
}

export class ListClinicalPatientsOverviewQueryDto {
  @ApiPropertyOptional({ enum: ['YES', 'NO'], description: 'Filters by the existence of at least one Treatment En curso.' })
  @IsOptional() @IsIn(['YES', 'NO']) treatmentInProgress?: 'YES' | 'NO';
  @ApiPropertyOptional({ enum: [30, 60, 90], description: 'Minimum complete days without attention for at least one Treatment En curso.' })
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([30, 60, 90]) withoutRecentAttentionDays?: 30 | 60 | 90;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ type: Number, default: 25, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class ClinicalPatientOverviewDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) dni!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Most recent attention of the patient, regardless of Treatment association.' }) lastAttentionAt!: string | null;
}

export class ClinicalPatientOverviewMetaDto {
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) totalPages!: number;
}

export class ClinicalPatientOverviewListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalPatientOverviewDto] }) data!: ClinicalPatientOverviewDto[];
  @ApiProperty({ type: () => ClinicalPatientOverviewMetaDto }) meta!: ClinicalPatientOverviewMetaDto;
}

export class ClinicalChargeSplitDto {
  @ApiProperty({ type: String, pattern: ARS_PATTERN.source, example: '12000' }) @Matches(ARS_PATTERN) patientAmountArs!: string;
  @ApiProperty({ type: String, pattern: ARS_PATTERN.source, example: '0' }) @Matches(ARS_PATTERN) socialWorkAmountArs!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() socialWorkOrderId?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() socialWorkId?: string | null;
}

export class AttendAppointmentDto extends ClinicalChargeSplitDto {}

export class DirectAttentionDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() serviceId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() occurredAt!: string;
  @ApiPropertyOptional({ type: String, pattern: ARS_PATTERN.source, example: '12000' }) @IsOptional() @Matches(ARS_PATTERN) patientAmountArs?: string;
  @ApiPropertyOptional({ type: String, pattern: ARS_PATTERN.source, example: '0' }) @IsOptional() @Matches(ARS_PATTERN) socialWorkAmountArs?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() socialWorkOrderId?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() socialWorkId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 500, description: 'Required only when the attention is exempt from billing.' }) @IsOptional() @IsString() @MinLength(1) @MaxLength(500) exemptReason?: string;
}

export class AppointmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() serviceId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() startAt!: string;
  @ApiPropertyOptional({ type: String, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) operationalNote?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() startAt!: string;
  @ApiPropertyOptional({ type: String, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) operationalNote?: string;
}

export class CorrectAppointmentDto {
  @ApiProperty({ enum: ClinicalAppointmentStatus, type: String }) @IsEnum(ClinicalAppointmentStatus) status!: ClinicalAppointmentStatus;
}

export class EvolutionDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() evolutionText?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() practicesOrManeuvers?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() indicationsOrNextSteps?: string;
}

export class ClinicalTestDefinitionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: ClinicalTestResponseType, type: String }) @IsEnum(ClinicalTestResponseType) responseType!: ClinicalTestResponseType;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() scaleMin?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() scaleMax?: string;
}

export class ClinicalTestResultDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() testDefinitionId?: string;
  @ApiPropertyOptional({ type: () => ClinicalTestDefinitionDto }) @IsOptional() @ValidateNested() @Type(() => ClinicalTestDefinitionDto) inlineDefinition?: ClinicalTestDefinitionDto;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() measurementMethodId?: string;
  @ApiPropertyOptional({ enum: ['LEFT', 'RIGHT'], type: String }) @IsOptional() @IsEnum({ LEFT: 'LEFT', RIGHT: 'RIGHT' }) side?: 'LEFT' | 'RIGHT';
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() observation?: string;
  @ApiProperty({ type: String, description: 'Value interpreted according to the selected test definition.' }) @IsDefined() value!: string | number | boolean;
}

export class ClinicalEvaluationDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) bodyAreaOrType!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() protocolId?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() conclusion?: string;
  @ApiProperty({ type: () => [ClinicalTestResultDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ClinicalTestResultDto) results!: ClinicalTestResultDto[];
}

export class CatalogNameDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) name!: string;
}

export class MeasurementMethodDto extends CatalogNameDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() description?: string;
}

export class SalaClinicalIndicationDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() treatmentId?: string;
  @ApiProperty({ enum: TrainingCondition, type: String }) @IsEnum(TrainingCondition) trainingCondition!: TrainingCondition;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() affectedArea?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() instructions?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() responsibleProfessionalId?: string;
}

export class SocialWorkOrderDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() socialWorkId!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) reference!: string;
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString({ strict: true }) issueDate?: string;
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString({ strict: true }) expirationDate?: string;
}

export class ClinicalStudyDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) studyDate!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) studyType!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() treatmentId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() description?: string | null;
}

export class UpdateClinicalStudyDto {
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString({ strict: true }) studyDate?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MinLength(1) studyType?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() treatmentId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() description?: string | null;
}

export class TreatmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() responsibleProfessionalId!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) consultationReason!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) bodyAreaOrInjury!: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() objective?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() interventionPlan?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() currentStage?: string;
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) startDate!: string;
}

export class FinalizeTreatmentDto {
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) finishDate!: string;
  @ApiPropertyOptional({ enum: TreatmentFinishReason, type: String }) @IsOptional() @IsEnum(TreatmentFinishReason) finishReason?: TreatmentFinishReason;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() conclusion?: string;
}
