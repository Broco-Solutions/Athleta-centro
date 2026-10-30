import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export const TRAINING_WEIGHT_PATTERN = /^\d{1,35}(?:[.,]\d{1,30})?$/;
export class TrainingWeightDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Routine entry ID on creation; saved training entry ID on correction' })
  @IsUUID() id!: string;
  @ApiProperty({ type: String, nullable: true, example: '32.5', description: 'Kilograms; null means no weight recorded. Up to 35 integer and 30 fractional digits.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(',', '.') : value)
  @IsOptional() @Matches(TRAINING_WEIGHT_PATTERN) weightKg!: string | null;
}
export class CorrectTrainingRecordDto {
  @ApiProperty({ type: () => [TrainingWeightDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TrainingWeightDto) exercises!: TrainingWeightDto[];
}
export class CreateTrainingRecordDto extends CorrectTrainingRecordDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() routineId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() routineDayId!: string;
  @ApiProperty({ type: String, format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date!: string;
}
export class TrainingRecordQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class TrainingContextQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'Show the latest previously saved weights up to this date; defaults to operational today' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date?: string;
}
export class TrainingExerciseSnapshotDto {
  @ApiProperty({ type: Number, nullable: true }) blockPosition!: number | null;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) exerciseDefinitionId!: string;
  @ApiProperty({ type: String }) exerciseName!: string;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: String, nullable: true }) series!: string | null;
  @ApiProperty({ type: String, nullable: true }) repetitions!: string | null;
  @ApiProperty({ type: String, nullable: true }) duration!: string | null;
  @ApiProperty({ type: String, nullable: true }) load!: string | null;
  @ApiProperty({ type: String, nullable: true }) rest!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
}
export class TrainingRecordExerciseDto extends TrainingExerciseSnapshotDto {
  @ApiProperty({ type: String }) routineExerciseId!: string;
  @ApiProperty({ type: String, nullable: true }) weightKg!: string | null;
}
export class TrainingRecordSummaryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) routineId!: string;
  @ApiProperty({ type: String }) routineDayId!: string;
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty({ type: String, nullable: true }) dayName!: string | null;
  @ApiProperty({ type: Number }) dayPosition!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class TrainingRecordDetailDto extends TrainingRecordSummaryDto {
  @ApiProperty({ type: () => [TrainingRecordExerciseDto] }) exercises!: TrainingRecordExerciseDto[];
}
export class TrainingRecordEnvelopeDto { @ApiProperty({ type: () => TrainingRecordDetailDto }) data!: TrainingRecordDetailDto; }
export class TrainingPageMetaDto {
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) totalPages!: number;
}
export class TrainingRecordListEnvelopeDto {
  @ApiProperty({ type: () => [TrainingRecordSummaryDto] }) data!: TrainingRecordSummaryDto[];
  @ApiProperty({ type: () => TrainingPageMetaDto }) meta!: TrainingPageMetaDto;
}
export class TrainingContextExerciseDto extends TrainingExerciseSnapshotDto {
  @ApiProperty({ type: String, nullable: true }) lastWeightKg!: string | null;
}
export class TrainingContextDayDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: () => [TrainingContextExerciseDto] }) exercises!: TrainingContextExerciseDto[];
}
export class TrainingContextRoutineDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) createdOn!: string;
  @ApiProperty({ type: () => [TrainingContextDayDto] }) days!: TrainingContextDayDto[];
}
export class TrainingContextDto {
  @ApiProperty({ type: String, format: 'date' }) today!: string;
  @ApiProperty({ type: () => TrainingContextRoutineDto, nullable: true }) routine!: TrainingContextRoutineDto | null;
}
export class TrainingContextEnvelopeDto { @ApiProperty({ type: () => TrainingContextDto }) data!: TrainingContextDto; }
