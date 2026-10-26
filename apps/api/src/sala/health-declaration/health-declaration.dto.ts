import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsString, MaxLength, ValidateNested, IsOptional, Matches, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class HealthPersonalDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) emergencyContactName!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(80) emergencyContactPhone!: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) locality?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) occupation?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) socialWork?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) affiliateNumber?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) primaryDoctor?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) guardianName?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(80) guardianDni?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() guardianConfirmed?: boolean;
}
export class HealthActivityDto {
  @ApiPropertyOptional({ enum: ['YES', 'NO', 'NOT_DISCLOSED'] }) @IsOptional() @IsString() practice?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) sport?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) frequency?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) club?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) level?: string;
}
export class HealthConsentsDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() physicalActivity!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() truthfulness!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() emergenciesAndPrivacy!: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() healthDataProcessing?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() kinesiology?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() manualEvaluation?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() therapeuticExercise?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() manualTherapy?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() physicalAgents?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() dryNeedling?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() taping?: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() shareWithDoctors!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() shareWithClubs!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() clinicalImage!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() institutionalImage!: boolean;
}
export class SubmitHealthDeclarationDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(100) documentVersion!: string;
  @ApiProperty({ type: HealthPersonalDto }) @ValidateNested() @Type(() => HealthPersonalDto) personal!: HealthPersonalDto;
  @ApiProperty({ type: HealthActivityDto }) @ValidateNested() @Type(() => HealthActivityDto) activity!: HealthActivityDto;
  @ApiProperty({ type: Object, additionalProperties: true, description: 'Optional kinesiological fields, only with healthDataProcessing consent.' }) @IsObject() kinesiology!: Record<string, string>;
  @ApiProperty({ type: Object, additionalProperties: true, description: 'Document question IDs mapped to { answer: YES | NO | NOT_DISCLOSED, details?: string }.' }) @IsObject() answers!: Record<string, { answer: 'YES' | 'NO' | 'NOT_DISCLOSED'; details?: string }>;
  @ApiProperty({ type: HealthConsentsDto }) @ValidateNested() @Type(() => HealthConsentsDto) consents!: HealthConsentsDto;
  @ApiProperty({ type: Boolean }) @IsBoolean() confirmed!: boolean;
}
export class RegisterPaperHealthDeclarationDto {
  @ApiProperty({ type: String, format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) signedOn!: string;
}
export class HealthDeclarationSummaryDto {
  @ApiProperty({ enum: ['DIGITAL', 'PAPER'] }) origin!: 'DIGITAL' | 'PAPER';
  @ApiPropertyOptional({ type: String, format: 'date' }) signedOn?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) registeredAt?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) registeredBy?: string;
  @ApiPropertyOptional({ type: String }) registeredByName?: string;
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, description: 'ISO timestamp for DIGITAL; signature date YYYY-MM-DD for PAPER.' }) submittedAt!: string;
  @ApiProperty({ type: String, description: 'ISO timestamp for DIGITAL; inclusive expiry date YYYY-MM-DD for PAPER (Argentina).' }) validUntil!: string;
  @ApiPropertyOptional({ type: String }) documentVersion?: string;
}
export class HealthDeclarationStatusDto {
  @ApiProperty({ enum: ['MISSING', 'CURRENT', 'EXPIRED'] }) status!: 'MISSING' | 'CURRENT' | 'EXPIRED';
  @ApiProperty({ type: Boolean }) required!: boolean;
  @ApiProperty({ type: Boolean }) documentAvailable!: boolean;
  @ApiPropertyOptional({ type: HealthDeclarationSummaryDto, nullable: true }) latest!: HealthDeclarationSummaryDto | null;
}
export class HealthDeclarationDetailDto extends HealthDeclarationSummaryDto {
  @ApiProperty({ type: Object, additionalProperties: true }) identity!: Record<string, unknown>;
  @ApiProperty({ type: HealthPersonalDto }) personal!: HealthPersonalDto;
  @ApiProperty({ type: HealthActivityDto }) activity!: HealthActivityDto;
  @ApiProperty({ type: Object, additionalProperties: true }) kinesiology!: Record<string, string>;
  @ApiProperty({ type: Object, additionalProperties: true }) answers!: Record<string, { answer: 'YES' | 'NO' | 'NOT_DISCLOSED'; details?: string }>;
  @ApiProperty({ type: HealthConsentsDto }) consents!: HealthConsentsDto;
  @ApiProperty({ type: Object, additionalProperties: true }) document!: Record<string, unknown>;
}
export class HealthDeclarationStatusEnvelopeDto { @ApiProperty({ type: HealthDeclarationStatusDto }) data!: HealthDeclarationStatusDto; }
export class HealthDeclarationListEnvelopeDto { @ApiProperty({ type: [HealthDeclarationSummaryDto] }) data!: HealthDeclarationSummaryDto[]; }
export class HealthDeclarationDetailEnvelopeDto { @ApiProperty({ type: HealthDeclarationDetailDto }) data!: HealthDeclarationDetailDto; }
export class HealthDocumentEnvelopeDto {
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true }) data!: Record<string, unknown> | null;
}
