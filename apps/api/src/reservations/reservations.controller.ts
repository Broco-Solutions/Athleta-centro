import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequireAnyPermission } from '../auth/permissions.guard';
import { ReservationDateQueryDto, ReservationsEnvelopeDto, ReservationsResponseDto } from './reservations.dto';
import { ReservationsService } from './reservations.service';
import { isClinicEnabled } from '../config/env';

@ApiTags('Reservations')
@Controller('reservations')
@UseGuards(PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequireAnyPermission('SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'getReservationsTimeline' })
  @ApiQuery({ name: 'date', required: true, type: String, format: 'date' })
  @ApiOkResponse({ type: ReservationsEnvelopeDto })
  async list(@Query() query: ReservationDateQueryDto, @Req() request: { athletaUserId?: string; athletaPermissions?: readonly string[] }): Promise<{ data: ReservationsResponseDto }> {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    if (!isClinicEnabled() && !request.athletaPermissions?.includes('SALA_RELATION_READ')) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Permission denied' });
    return { data: await this.reservations.list(query.date, request.athletaUserId) };
  }
}
