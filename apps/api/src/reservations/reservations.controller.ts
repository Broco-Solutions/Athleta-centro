import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequireAnyPermission } from '../auth/permissions.guard';
import { ReservationDateQueryDto, ReservationsResponseDto } from './reservations.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservations')
@Controller('reservations')
@UseGuards(PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequireAnyPermission('SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'getReservationsTimeline' })
  @ApiQuery({ name: 'date', required: true, type: String, format: 'date' })
  @ApiResponse({ type: ReservationsResponseDto })
  async list(@Query() query: ReservationDateQueryDto, @Req() request: { athletaUserId?: string }): Promise<{ data: ReservationsResponseDto }> {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    return { data: await this.reservations.list(query.date, request.athletaUserId) };
  }
}
