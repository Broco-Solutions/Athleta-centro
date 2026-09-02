import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { ReservationsResponseDto } from './reservations.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservations')
@Controller('reservations')
@UseGuards(PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermissions('SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'getReservationsTimeline' })
  @ApiQuery({ name: 'date', required: true, type: String, format: 'date' })
  @ApiResponse({ type: ReservationsResponseDto })
  async list(@Query('date') date: string): Promise<{ data: ReservationsResponseDto }> { return { data: await this.reservations.list(date) }; }
}
