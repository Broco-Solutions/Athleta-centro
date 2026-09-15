import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { ClinicalTreatmentAssociationListEnvelopeDto, FinalizeTreatmentDto, TreatmentDto } from './clinic.dto';
import { TreatmentService } from './treatment.service';

@ApiTags('Clinic Treatments')
@Controller('clinic/treatments')
@UseGuards(PermissionsGuard)
export class TreatmentController {
  constructor(private readonly treatments: TreatmentService) {}

  @Post()
  @RequirePermissions('CLINIC_TREATMENT_MANAGE')
  @ApiOperation({ operationId: 'createClinicalTreatment' })
  @ApiBody({ type: TreatmentDto })
  async create(@Body() body: TreatmentDto) { return { data: await this.treatments.create(body) }; }

  @Get()
  @RequirePermissions('CLINICAL_HISTORY_READ')
  @ApiOperation({ operationId: 'listClinicalTreatments' })
  @ApiQuery({ name: 'personId', required: false, type: String, format: 'uuid' })
  @ApiOkResponse({ type: ClinicalTreatmentAssociationListEnvelopeDto })
  async list(@Query('personId') personId?: string) { return { data: await this.treatments.list(personId) }; }

  @Post(':id/finalize')
  @RequirePermissions('CLINIC_TREATMENT_MANAGE')
  @ApiOperation({ operationId: 'finalizeClinicalTreatment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: FinalizeTreatmentDto })
  async finalize(@Param('id') id: string, @Body() body: FinalizeTreatmentDto) { return { data: await this.treatments.finalize(id, body) }; }

  @Post(':id/reopen')
  @RequirePermissions('CLINIC_TREATMENT_MANAGE')
  @ApiOperation({ operationId: 'reopenClinicalTreatment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async reopen(@Param('id') id: string) { return { data: await this.treatments.reopen(id) }; }
}
