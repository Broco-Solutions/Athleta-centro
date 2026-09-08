import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import {
  CatalogNameDto,
  ClinicalEvaluationDto,
  ClinicalTestDefinitionDto,
  MeasurementMethodDto,
} from './clinic.dto';
import { ClinicalCatalogService } from './clinical-catalog.service';
import { EvaluationService } from './evaluation.service';

@ApiTags('Clinic Evaluations')
@Controller('clinic')
@UseGuards(PermissionsGuard)
export class EvaluationController {
  constructor(private readonly evaluations: EvaluationService, private readonly catalogs: ClinicalCatalogService) {}

  @Post('attentions/:attentionId/evaluations')
  @ApiOperation({ operationId: 'createClinicalEvaluation' })
  @ApiParam({ name: 'attentionId', type: String, format: 'uuid' })
  @ApiBody({ type: ClinicalEvaluationDto })
  @RequirePermissions('CLINIC_EVALUATION_MANAGE')
  async create(@Param('attentionId') id: string, @Body() body: ClinicalEvaluationDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.evaluations.create(id, this.actor(request), body) };
  }

  @Get('attentions/:attentionId/evaluations')
  @ApiOperation({ operationId: 'listClinicalEvaluations' })
  @ApiParam({ name: 'attentionId', type: String, format: 'uuid' })
  @RequirePermissions('CLINICAL_HISTORY_READ')
  async list(@Param('attentionId') id: string) { return { data: await this.evaluations.list(id) }; }

  @Get('evaluations/:id')
  @ApiOperation({ operationId: 'getClinicalEvaluation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('CLINICAL_HISTORY_READ')
  async detail(@Param('id') id: string) { return { data: await this.evaluations.detail(id) }; }

  @Patch('evaluations/:id')
  @ApiOperation({ operationId: 'correctClinicalEvaluation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: ClinicalEvaluationDto })
  @RequirePermissions('CLINIC_EVALUATION_MANAGE')
  async correct(@Param('id') id: string, @Body() body: ClinicalEvaluationDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.evaluations.correct(id, this.actor(request), body) };
  }

  @Get('protocols')
  @ApiOperation({ operationId: 'listClinicalProtocols' })
  @RequirePermissions('CLINICAL_HISTORY_READ')
  async protocols() { return { data: await this.catalogs.listProtocols() }; }

  @Post('protocols')
  @ApiOperation({ operationId: 'createClinicalProtocol' })
  @ApiBody({ type: CatalogNameDto })
  @RequirePermissions('CLINIC_PROTOCOL_CATALOG_MANAGE')
  async createProtocol(@Body() body: CatalogNameDto) { return { data: await this.catalogs.createProtocol(body.name) }; }

  @Patch('protocols/:id/retire')
  @ApiOperation({ operationId: 'retireClinicalProtocol' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('CLINIC_PROTOCOL_CATALOG_MANAGE')
  async retireProtocol(@Param('id') id: string) { return { data: await this.catalogs.retireProtocol(id) }; }

  @Get('test-definitions')
  @ApiOperation({ operationId: 'listClinicalTestDefinitions' })
  @RequirePermissions('CLINICAL_HISTORY_READ')
  async tests() { return { data: await this.catalogs.listTests() }; }

  @Post('test-definitions')
  @ApiOperation({ operationId: 'createClinicalTestDefinition' })
  @ApiBody({ type: ClinicalTestDefinitionDto })
  @RequirePermissions('CLINIC_TEST_CATALOG_MANAGE')
  async createTest(@Body() body: ClinicalTestDefinitionDto) { return { data: await this.catalogs.createTest(body) }; }

  @Patch('test-definitions/:id/retire')
  @ApiOperation({ operationId: 'retireClinicalTestDefinition' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('CLINIC_TEST_CATALOG_MANAGE')
  async retireTest(@Param('id') id: string) { return { data: await this.catalogs.retireTest(id) }; }

  @Get('measurement-methods')
  @ApiOperation({ operationId: 'listClinicalMeasurementMethods' })
  @RequirePermissions('CLINICAL_HISTORY_READ')
  async methods() { return { data: await this.catalogs.listMethods() }; }

  @Post('measurement-methods')
  @ApiOperation({ operationId: 'createClinicalMeasurementMethod' })
  @ApiBody({ type: MeasurementMethodDto })
  @RequirePermissions('CLINIC_MEASUREMENT_METHOD_MANAGE')
  async createMethod(@Body() body: MeasurementMethodDto) { return { data: await this.catalogs.createMethod(body.name, body.description) }; }

  @Patch('measurement-methods/:id/retire')
  @ApiOperation({ operationId: 'retireClinicalMeasurementMethod' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('CLINIC_MEASUREMENT_METHOD_MANAGE')
  async retireMethod(@Param('id') id: string) { return { data: await this.catalogs.retireMethod(id) }; }

  private actor(request: { athletaUserId?: string }): string {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    return request.athletaUserId;
  }
}
