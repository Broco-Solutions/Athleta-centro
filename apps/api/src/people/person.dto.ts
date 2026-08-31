import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePersonDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(30) dni!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(50) phone!: string;
  @ApiProperty({ type: String, format: 'date', example: '1990-05-20' }) @IsDateString({ strict: true }) birthDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsEmail() @MaxLength(254) email?: string | null;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(150) emergencyContactName?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(50) emergencyContactPhone?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() socialWorkId?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) affiliateNumber?: string;
}

export class UpdatePersonDto extends PartialType(CreatePersonDto) {}

export class ListPeopleQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ type: Number, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ type: Number, default: 25, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class PersonResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) dni!: string;
  @ApiProperty({ type: String }) phone!: string;
  @ApiProperty({ type: String, format: 'date' }) birthDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) emergencyContactName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) emergencyContactPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) socialWorkId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) affiliateNumber!: string | null;
  @ApiProperty({ type: String, enum: ['INACTIVE'], description: 'Derived from currently available relationships.' }) status!: 'INACTIVE';
  @ApiProperty({ type: () => [String] }) contexts!: string[];
  @ApiProperty({ type: Boolean, description: 'Whether this person has an active Sala participation.' }) hasSalaParticipation!: boolean;
  @ApiProperty({ type: Boolean, description: 'Whether this person is explicitly registered as a clinical patient.' }) isClinicalPatient!: boolean;
  @ApiPropertyOptional({ type: String, pattern: '^\\d{4}$', description: 'Returned only once after creation.' }) initialPin?: string;
}

export class PersonEnvelopeDto { @ApiProperty({ type: () => PersonResponseDto }) data!: PersonResponseDto; }
export class PortalPinEnvelopeDto { @ApiProperty({ type: String, pattern: '^\\d{4}$' }) data!: { pin: string }; }
export class PeopleMetaDto { @ApiProperty({ type: Number }) page!: number; @ApiProperty({ type: Number }) pageSize!: number; @ApiProperty({ type: Number }) total!: number; @ApiProperty({ type: Number }) totalPages!: number; }
export class PeopleListEnvelopeDto { @ApiProperty({ type: () => [PersonResponseDto] }) data!: PersonResponseDto[]; @ApiProperty({ type: () => PeopleMetaDto }) meta!: PeopleMetaDto; }
