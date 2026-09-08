import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { InternalUserStatus, Role } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateTeamUserDto { @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) firstName!: string; @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(100) lastName!: string; @ApiProperty({ type: String }) @IsEmail() email!: string; @ApiProperty({ enum: Role, isArray: true }) @IsArray() @ArrayMinSize(1) @IsEnum(Role, { each: true }) roles!: Role[]; }
export class UpdateTeamUserDto extends PartialType(OmitType(CreateTeamUserDto, ['roles'] as const)) {}
export class TeamRoleDto { @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role; }
export class TeamUserDto { @ApiProperty({ type: String, format: 'uuid' }) id!: string; @ApiProperty({ type: String }) firstName!: string; @ApiProperty({ type: String }) lastName!: string; @ApiProperty({ type: String }) email!: string; @ApiProperty({ enum: InternalUserStatus }) status!: InternalUserStatus; @ApiProperty({ enum: Role, isArray: true }) roles!: Role[]; }
export class TeamUserEnvelopeDto { @ApiProperty({ type: () => TeamUserDto }) data!: TeamUserDto; }
export class TeamUserCreatedDto extends TeamUserEnvelopeDto { @ApiProperty({ type: String, description: 'Returned once; never persisted in plaintext.' }) temporaryPassword!: string; }
export class TeamCredentialResetDto { @ApiProperty({ type: String, description: 'Returned once; never persisted in plaintext.' }) temporaryPassword!: string; }
export class TeamUserListEnvelopeDto { @ApiProperty({ type: () => [TeamUserDto] }) data!: TeamUserDto[]; }
