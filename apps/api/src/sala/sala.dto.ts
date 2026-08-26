import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalaScheduleExceptionType, SalaWeekday } from '@prisma/client';

export class CapacityDto { @ApiProperty({ type: Number, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) capacity!: number; }
export class UpdateSalaConfigurationDto extends CapacityDto {}
export class PlanDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string; @ApiProperty() @Type(() => Number) @IsInt() monthlyAmount!: number; @ApiPropertyOptional() @IsOptional() isSelectable?: boolean; }
export class ScheduleSlotDto { @ApiProperty({ enum: SalaWeekday }) @IsEnum(SalaWeekday) weekday!: SalaWeekday; @ApiProperty({ example: '09:00' }) @IsString() startTime!: string; @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes = 60; @ApiPropertyOptional({ minimum: 1, nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) specificCapacity?: number | null; }
export class ScheduleExceptionDto { @ApiProperty({ format: 'date' }) @IsDateString({ strict: true }) date!: string; @ApiProperty({ enum: SalaScheduleExceptionType }) @IsEnum(SalaScheduleExceptionType) type!: SalaScheduleExceptionType; @ApiPropertyOptional({ minimum: 1, nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacityOverride?: number | null; }
export class JoinSalaDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() personId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() mainProfessorId!: string; @ApiProperty({ type: String, format: 'uuid' }) @IsString() planId!: string; @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) startDate!: string; }
export class ChangeProfessorDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() mainProfessorId!: string; }
export class ChangePlanDto { @ApiProperty({ type: String, format: 'uuid' }) @IsString() planId!: string; }
