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
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClinicalCoverage,
  ClinicalAppointmentStatus,
  ClinicalTestResponseType,
  TrainingCondition,
  TreatmentFinishReason,
  TreatmentStatus,
} from '@prisma/client';

export class PatientDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
}

export class ListClinicalPatientsOverviewQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) search?: string;
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
  @ApiProperty({ type: Boolean }) hasSalaParticipation!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) sport!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) club!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) nextAppointmentAt!: string | null;
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

export class AttendAppointmentDto {
  @ApiProperty({ enum: ClinicalCoverage, type: String }) @IsEnum(ClinicalCoverage) coverage!: ClinicalCoverage;
}

export class DirectAttentionDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() occurredAt!: string;
  @ApiProperty({ enum: ClinicalCoverage, type: String }) @IsEnum(ClinicalCoverage) coverage!: ClinicalCoverage;
}

export class UpdateClinicalAttentionDto {
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() occurredAt!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ enum: ClinicalCoverage, type: String }) @IsEnum(ClinicalCoverage) coverage!: ClinicalCoverage;
}

export class SetClinicalAttentionTreatmentDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() treatmentId?: string | null;
}

export class ListClinicalProfessionalsQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Includes inactive clinical professionals only when the attention date is before the current Buenos Aires operational day.' })
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class AppointmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() startAt!: string;
  @ApiPropertyOptional({ type: Number, default: 60, minimum: 1 }) @IsOptional() @IsInt() @Min(1) durationMinutes = 60;
  @ApiPropertyOptional({ type: String, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) operationalNote?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsDateString() startAt!: string;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) durationMinutes!: number;
  @ApiPropertyOptional({ type: String, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) operationalNote?: string;
}

export class CorrectAppointmentDto {
  @ApiProperty({ enum: ClinicalAppointmentStatus, type: String }) @IsEnum(ClinicalAppointmentStatus) status!: ClinicalAppointmentStatus;
  @ApiPropertyOptional({ enum: ClinicalCoverage, type: String, description: 'Required when correcting the appointment to ATTENDED.' })
  @IsOptional() @IsEnum(ClinicalCoverage) coverage?: ClinicalCoverage;
}

export class ListClinicalAppointmentsQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional({ enum: ['YES', 'NO'], description: 'When YES, returns past SCHEDULED appointments awaiting manual correction.' })
  @IsOptional() @IsIn(['YES', 'NO']) pendingPastScheduled?: 'YES' | 'NO';
}

export class ClinicalPersonSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) dni!: string;
}

export class ClinicalProfessionalSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ enum: ['KINESIOLOGIST', 'OSTEOPATH'], isArray: true }) roles!: Array<'KINESIOLOGIST' | 'OSTEOPATH'>;
}

export class ClinicalAppointmentOperationalDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startAt!: string;
  @ApiProperty({ type: Number, minimum: 1 }) durationMinutes!: number;
  @ApiProperty({ enum: ClinicalAppointmentStatus }) status!: ClinicalAppointmentStatus;
  @ApiProperty({ type: String, nullable: true }) operationalNote!: string | null;
  @ApiProperty({ type: () => ClinicalPersonSummaryDto }) person!: ClinicalPersonSummaryDto;
  @ApiProperty({ type: () => ClinicalProfessionalSummaryDto }) professional!: ClinicalProfessionalSummaryDto;
  @ApiProperty({ type: Boolean }) hasAttention!: boolean;
  @ApiProperty({ type: Boolean }) hasEvolution!: boolean;
  @ApiProperty({ enum: ClinicalCoverage, nullable: true }) coverage!: ClinicalCoverage | null;
  @ApiProperty({ type: Number, minimum: 0 }) overlapCount!: number;
}

export class ClinicalAppointmentEnvelopeDto {
  @ApiProperty({ type: () => ClinicalAppointmentOperationalDto }) data!: ClinicalAppointmentOperationalDto;
}

export class ClinicalAppointmentListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalAppointmentOperationalDto] }) data!: ClinicalAppointmentOperationalDto[];
}

export class ClinicalProfessionalListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalProfessionalSummaryDto] }) data!: ClinicalProfessionalSummaryDto[];
}

export class ClinicalPatientListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalPersonSummaryDto] }) data!: ClinicalPersonSummaryDto[];
}

export class ClinicalAttentionOperationalDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) personId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) professionalId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ enum: ClinicalCoverage, nullable: true }) coverage!: ClinicalCoverage | null;
  @ApiProperty({ enum: ['APPOINTMENT', 'DIRECT'] }) origin!: 'APPOINTMENT' | 'DIRECT';
  @ApiProperty({ type: () => ClinicalPersonSummaryDto }) person!: ClinicalPersonSummaryDto;
  @ApiProperty({ type: () => ClinicalProfessionalSummaryDto }) professional!: ClinicalProfessionalSummaryDto;
}

export class ClinicalAttentionEnvelopeDto {
  @ApiProperty({ type: () => ClinicalAttentionOperationalDto }) data!: ClinicalAttentionOperationalDto;
}

export class ClinicalAttentionListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalAttentionOperationalDto] }) data!: ClinicalAttentionOperationalDto[];
}

export class EvolutionDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() evolutionText?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() practicesOrManeuvers?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() indicationsOrNextSteps?: string;
}

export class ClinicalEvolutionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) attentionId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) evolutionText!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) practicesOrManeuvers!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) indicationsOrNextSteps!: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) authorId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) lastModifiedById!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastModifiedAt!: Date | null;
}

export class ClinicalEvolutionEnvelopeDto {
  @ApiProperty({ type: () => ClinicalEvolutionDto, nullable: true }) data!: ClinicalEvolutionDto | null;
}

export class ClinicalTreatmentAssociationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) personId!: string;
  @ApiProperty({ enum: TreatmentStatus }) status!: TreatmentStatus;
  @ApiProperty({ type: String, format: 'date' }) startDate!: Date;
}

export class ClinicalTreatmentAssociationListEnvelopeDto {
  @ApiProperty({ type: () => [ClinicalTreatmentAssociationDto] }) data!: ClinicalTreatmentAssociationDto[];
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

export class SalaSafeIndicationProfessionalDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
}
export class SalaSafeClinicalIndicationDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: TrainingCondition }) trainingCondition!: TrainingCondition;
  @ApiProperty({ type: String, nullable: true }) affectedArea!: string | null;
  @ApiProperty({ type: String, nullable: true }) instructions!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) lastUpdate!: string;
  @ApiProperty({ type: () => SalaSafeIndicationProfessionalDto }) responsibleProfessional!: SalaSafeIndicationProfessionalDto;
}
export class SalaSafeClinicalIndicationListEnvelopeDto {
  @ApiProperty({ type: () => [SalaSafeClinicalIndicationDto] }) data!: SalaSafeClinicalIndicationDto[];
}
