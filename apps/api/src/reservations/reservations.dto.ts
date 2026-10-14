import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ReservationDateQueryDto {
  @ApiProperty({ type: String, format: 'date' }) @IsDateString({ strict: true }) date!: string;
}

export class ReservationsPersonDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiProperty({ type: String }) dni!: string;
}

export class ReservationsProfessionalDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) firstName!: string;
  @ApiProperty({ type: String }) lastName!: string;
  @ApiPropertyOptional({ type: String }) discipline?: string;
}

export class ReservationBookingDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, enum: ['SALA', 'CLINIC'] }) source!: 'SALA' | 'CLINIC';
  @ApiProperty({ type: () => ReservationsPersonDto }) person!: ReservationsPersonDto;
  @ApiProperty({ type: String, example: '09:00' }) startTime!: string;
  @ApiProperty({ type: Number, multipleOf: 15, minimum: 15 }) durationMinutes!: number;
  @ApiProperty({ type: String }) serviceName!: string;
  @ApiProperty({ type: String, enum: ['RESERVED', 'SCHEDULED', 'ATTENDED', 'ABSENT', 'CANCELLED', 'PENDING_PAYMENT'] }) status!: string;
  @ApiPropertyOptional({ type: String, enum: ['FIXED', 'ONE_OFF', 'SPONTANEOUS', 'APPOINTMENT'] }) origin?: string;
  @ApiPropertyOptional({ type: () => ReservationsProfessionalDto, nullable: true }) professional?: ReservationsProfessionalDto | null;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) scheduleSlotId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) sourceId?: string;
  @ApiPropertyOptional({ type: Boolean }) cancelledForNonPayment?: boolean;
  @ApiPropertyOptional({ type: Boolean }) hasClinicalIndication?: boolean;
}

export class ReservationRowDto {
  @ApiProperty({ type: String, enum: ['SALA', 'PROFESSIONAL'] }) kind!: 'SALA' | 'PROFESSIONAL';
  @ApiPropertyOptional({ type: () => ReservationsProfessionalDto, nullable: true }) professional?: ReservationsProfessionalDto | null;
  @ApiProperty({ type: () => [ReservationBookingDto] }) bookings!: ReservationBookingDto[];
}

export class ReservationsResponseDto {
  @ApiProperty({ format: 'date', type: String }) date!: string;
  @ApiProperty({ type: String, example: '08:00' }) startTime!: string;
  @ApiProperty({ type: String, example: '20:00' }) endTime!: string;
  @ApiProperty({ type: () => [ReservationRowDto] }) rows!: ReservationRowDto[];
}

export class ReservationsEnvelopeDto {
  @ApiProperty({ type: () => ReservationsResponseDto }) data!: ReservationsResponseDto;
}
