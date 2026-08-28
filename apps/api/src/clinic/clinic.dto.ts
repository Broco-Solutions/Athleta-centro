import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ClinicalAppointmentStatus } from '@prisma/client';
export class PatientDto { @IsUUID() personId!: string; }
export class AppointmentDto { @IsUUID() personId!: string; @IsUUID() serviceId!: string; @IsUUID() professionalId!: string; @IsDateString() startAt!: string; @IsOptional() @IsString() operationalNote?: string; }
export class RescheduleAppointmentDto { @IsUUID() professionalId!: string; @IsDateString() startAt!: string; @IsOptional() @IsString() operationalNote?: string; }
export class CorrectAppointmentDto { @IsEnum(ClinicalAppointmentStatus) status!: ClinicalAppointmentStatus; }
