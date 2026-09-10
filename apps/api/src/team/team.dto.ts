import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { InternalUserStatus, Role } from '@prisma/client';
import { ArrayMinSize, IsArray, IsDateString, IsEmail, IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateTeamUserDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty({ type: String }) @IsEmail() @MaxLength(254) email!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50 }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsString() @MaxLength(50) phone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsString() @MaxLength(30) dni?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 250 }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsString() @MaxLength(250) address?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsDateString({ strict: true }) birthDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsString() @MaxLength(120) profession?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) @ValidateIf((_object, value) => value !== null && value !== undefined) @IsDateString({ strict: true }) athletaStartDate?: string | null;
  @ApiProperty({ enum: Role, isArray: true }) @IsArray() @ArrayMinSize(1) @IsEnum(Role, { each: true }) roles!: Role[];
}
export class UpdateTeamUserDto extends PartialType(OmitType(CreateTeamUserDto, ['roles'] as const)) {}
export class TeamRoleDto { @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role; }
export class TeamUserDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) dni!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) birthDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) profession!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) athletaStartDate!: string | null;
  @ApiProperty({ enum: InternalUserStatus }) status!: InternalUserStatus;
  @ApiProperty({ enum: Role, isArray: true }) roles!: Role[];
}
export class TeamUserEnvelopeDto { @ApiProperty({ type: () => TeamUserDto }) data!: TeamUserDto; }
export class TeamUserCreatedDto extends TeamUserEnvelopeDto { @ApiProperty({ type: String, description: 'Returned once; never persisted in plaintext.' }) temporaryPassword!: string; }
export class TeamCredentialResetDto { @ApiProperty({ type: String, description: 'Returned once; never persisted in plaintext.' }) temporaryPassword!: string; }
export class TeamUserListEnvelopeDto { @ApiProperty({ type: () => [TeamUserDto] }) data!: TeamUserDto[]; }
