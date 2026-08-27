import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ClinicalAppointmentStatus } from '@prisma/client';
export class PatientDto { @IsUUID() personId!: string; }
export class AppointmentDto { @IsUUID() personId!: string; @IsUUID() professionalId!: string; @IsDateString() startAt!: string; @IsInt() @Min(1) durationMinutes = 60; @IsOptional() @IsString() operationalNote?: string; }
export class RescheduleAppointmentDto extends AppointmentDto {}
export class CorrectAppointmentDto { @IsEnum(ClinicalAppointmentStatus) status!: ClinicalAppointmentStatus; }
