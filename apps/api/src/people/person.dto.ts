import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePersonDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty({ type: String, example: '20123456', description: 'Required DNI with 6 to 8 digits; dots, spaces and hyphens are accepted and removed before persistence.' }) @IsString() @MaxLength(30) dni!: string;
  @ApiProperty({ type: String, example: '3415551234', description: 'Required Argentine national phone with 10 digits and no initial 0, +54 or old 15 prefix; spaces, parentheses, dots and hyphens are accepted.' }) @IsString() @MaxLength(50) phone!: string;
  @ApiProperty({ type: String, format: 'date', example: '1990-05-20' }) @IsDateString({ strict: true }) birthDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsEmail() @MaxLength(254) email?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() sport?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() club?: string | null;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(150) emergencyContactName?: string;
  @ApiPropertyOptional({ type: String, example: '1112345678', description: 'Optional emergency phone; when nonempty, the same national 10-digit phone rules apply. Empty values are stored as null.' }) @IsOptional() @IsString() @MaxLength(50) emergencyContactPhone?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) @IsOptional() @IsUUID() socialWorkId?: string | null;
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
  @ApiProperty({ type: String, example: '20123456', description: 'DNI stored as 6 to 8 digits.' }) dni!: string;
  @ApiProperty({ type: String, example: '3415551234', description: 'National phone stored as 10 digits with no initial 0.' }) phone!: string;
  @ApiProperty({ type: String, format: 'date' }) birthDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) emergencyContactName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '1112345678', description: 'Optional emergency phone stored as 10 national digits with no initial 0.' }) emergencyContactPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) socialWorkId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) affiliateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sport!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) club!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'INACTIVE'], description: 'Derived from currently available relationships.' }) status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: () => [String] }) contexts!: string[];
  @ApiProperty({ type: Boolean, description: 'Whether this person has an active Sala participation.' }) hasSalaParticipation!: boolean;
  @ApiProperty({ type: Boolean, description: 'Whether this person is explicitly registered as a clinical patient.' }) isClinicalPatient!: boolean;
  @ApiPropertyOptional({ type: String, pattern: '^\\d{4}$', description: 'Returned only once after creation.' }) initialPin?: string;
}

export class PersonEnvelopeDto { @ApiProperty({ type: () => PersonResponseDto }) data!: PersonResponseDto; }
export class PortalPinEnvelopeDto { @ApiProperty({ type: String, pattern: '^\\d{4}$' }) data!: string; }
export class PeopleMetaDto { @ApiProperty({ type: Number }) page!: number; @ApiProperty({ type: Number }) pageSize!: number; @ApiProperty({ type: Number }) total!: number; @ApiProperty({ type: Number }) totalPages!: number; }
export class PeopleListEnvelopeDto { @ApiProperty({ type: () => [PersonResponseDto] }) data!: PersonResponseDto[]; @ApiProperty({ type: () => PeopleMetaDto }) meta!: PeopleMetaDto; }
