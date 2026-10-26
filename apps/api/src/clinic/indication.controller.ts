import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { IndicationService } from './indication.service';
import { SalaClinicalIndicationDto, SalaSafeClinicalIndicationListEnvelopeDto } from './clinic.dto';

@ApiTags('Clinic Sala Indications')
@Controller()
@UseGuards(PermissionsGuard)
export class IndicationController {
  constructor(private readonly indications: IndicationService) {}
  private actor(request: { athletaUserId?: string }) { if (!request.athletaUserId) throw new Error('Authenticated actor missing'); return request.athletaUserId; }
  @Post('clinic/indications') @ApiOperation({ operationId: 'createSalaClinicalIndication' }) @ApiBody({ type: SalaClinicalIndicationDto }) @RequirePermissions('CLINIC_INDICATION_CONTENT_MANAGE')
  async create(@Body() body: SalaClinicalIndicationDto, @Req() request: { athletaUserId?: string }) { return { data: await this.indications.create(this.actor(request), body) }; }
  @Get('clinic/indications') @ApiOperation({ operationId: 'listSalaClinicalIndications' }) @ApiQuery({ name: 'personId', required: true, type: String, format: 'uuid' }) @RequirePermissions('CLINICAL_HISTORY_READ')
  async full(@Query('personId') personId: string) { return { data: await this.indications.listFull(personId) }; }
  @Get('sala/people/:personId/clinical-indications') @ApiOkResponse({ type: SalaSafeClinicalIndicationListEnvelopeDto }) @ApiOperation({ operationId: 'getSalaClinicalIndicationProjection' }) @ApiParam({ name: 'personId', type: String }) @RequirePermissions('SALA_CLINICAL_INDICATION_READ')
  async safe(@Param('personId') personId: string) { return { data: await this.indications.safe(personId) }; }
  @Post('clinic/indications/:id/close') @ApiOperation({ operationId: 'closeSalaClinicalIndication' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('SALA_CLINICAL_INDICATION_CLOSE')
  async close(@Param('id') id: string, @Req() request: { athletaUserId?: string }) { return { data: await this.indications.close(id, this.actor(request)) }; }
}
