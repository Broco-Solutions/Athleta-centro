import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import {
  AppointmentDto,
  AttendAppointmentDto,
  ClinicalAppointmentEnvelopeDto,
  ClinicalAppointmentListEnvelopeDto,
  ClinicalAttentionEnvelopeDto,
  ClinicalAttentionListEnvelopeDto,
  ClinicalPatientListEnvelopeDto,
  CorrectAppointmentDto,
  DirectAttentionDto,
  ClinicalPatientOverviewListEnvelopeDto,
  ClinicalProfessionalListEnvelopeDto,
  ListClinicalAppointmentsQueryDto,
  ListClinicalProfessionalsQueryDto,
  ListClinicalPatientsOverviewQueryDto,
  PatientDto,
  RescheduleAppointmentDto,
  SetClinicalAttentionTreatmentDto,
  UpdateClinicalAttentionDto,
} from './clinic.dto';
import { ClinicService } from './clinic.service';

@ApiTags('Clinic')
@Controller('clinic')
@UseGuards(PermissionsGuard)
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Post('patients')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'registerClinicalPatient' })
  @ApiBody({ type: PatientDto })
  async register(@Body() body: PatientDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.clinic.registerPatient(body.personId, this.actor(request)) };
  }

  @Get('patients')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'listClinicalPatients' })
  @ApiOkResponse({ type: ClinicalPatientListEnvelopeDto })
  async patients() { return { data: await this.clinic.listPatients() }; }

  @Get('patients/overview')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'listClinicalPatientsOverview' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'treatmentInProgress', required: false, enum: ['YES', 'NO'] })
  @ApiQuery({ name: 'withoutRecentAttentionDays', required: false, enum: [30, 60, 90] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: ClinicalPatientOverviewListEnvelopeDto })
  async patientOverview(@Query() query: ListClinicalPatientsOverviewQueryDto) {
    return await this.clinic.listPatientOverview(query);
  }

  @Get('professionals')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'listClinicalProfessionals', description: 'Returns the minimum active clinical-professional data needed by Clinic workflows without requiring Team access.' })
  @ApiQuery({ name: 'occurredAt', required: false, type: String, format: 'date-time' })
  @ApiOkResponse({ type: ClinicalProfessionalListEnvelopeDto })
  async professionals(@Query() query: ListClinicalProfessionalsQueryDto) { return { data: await this.clinic.listProfessionals(query) }; }

  @Post('appointments')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'createClinicalAppointment' })
  @ApiBody({ type: AppointmentDto })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async create(@Body() body: AppointmentDto) { return { data: await this.clinic.create(body) }; }

  @Post('attentions')
  @RequirePermissions('CLINIC_ATTENTION_REGISTER')
  @ApiOperation({ operationId: 'registerDirectClinicalAttention' })
  @ApiBody({ type: DirectAttentionDto })
  @ApiCreatedResponse({ type: ClinicalAttentionEnvelopeDto })
  async directAttention(@Body() body: DirectAttentionDto) { return { data: await this.clinic.registerDirectAttention(body) }; }

  @Get('attentions')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'listClinicalAttentions' })
  @ApiQuery({ name: 'personId', required: false, type: String, format: 'uuid' })
  @ApiOkResponse({ type: ClinicalAttentionListEnvelopeDto })
  async attentions(@Query('personId') personId?: string) { return { data: await this.clinic.listAttentions(personId) }; }

  @Patch('attentions/:id')
  @RequirePermissions('CLINIC_ATTENTION_REGISTER')
  @ApiOperation({ operationId: 'updateClinicalAttentionOperational' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateClinicalAttentionDto })
  @ApiOkResponse({ type: ClinicalAttentionEnvelopeDto })
  async updateAttention(@Param('id') id: string, @Body() body: UpdateClinicalAttentionDto) {
    return { data: await this.clinic.updateAttention(id, body) };
  }

  @Delete('attentions/:id')
  @RequirePermissions('CLINIC_ATTENTION_DELETE_EMPTY')
  @ApiOperation({ operationId: 'deleteEmptyClinicalAttention' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async deleteAttention(@Param('id') id: string) {
    await this.clinic.deleteEmptyAttention(id);
    return { data: { id } };
  }

  @Post('attentions/:id/treatment')
  @RequirePermissions('CLINIC_TREATMENT_MANAGE')
  @ApiOperation({ operationId: 'setClinicalAttentionTreatment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: SetClinicalAttentionTreatmentDto })
  @ApiOkResponse({ type: ClinicalAttentionEnvelopeDto })
  async setAttentionTreatment(@Param('id') id: string, @Body() body: SetClinicalAttentionTreatmentDto) {
    return { data: await this.clinic.setAttentionTreatment(id, body) };
  }

  @Get('appointments')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'listClinicalAppointments' })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'personId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'pendingPastScheduled', required: false, enum: ['YES', 'NO'] })
  @ApiOkResponse({ type: ClinicalAppointmentListEnvelopeDto })
  async list(@Query() query: ListClinicalAppointmentsQueryDto) {
    return { data: await this.clinic.list(query) };
  }

  @Get('appointments/:id')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'getClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ClinicalAppointmentEnvelopeDto })
  async detail(@Param('id') id: string) { return { data: await this.clinic.detail(id) }; }

  @Post('appointments/:id/reschedule')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'rescheduleClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: RescheduleAppointmentDto })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async reschedule(@Param('id') id: string, @Body() body: RescheduleAppointmentDto) {
    return { data: await this.clinic.reschedule(id, body) };
  }

  @Post('appointments/:id/correct')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'correctClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CorrectAppointmentDto })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async correct(@Param('id') id: string, @Body() body: CorrectAppointmentDto) {
    return { data: await this.clinic.correct(id, body) };
  }

  @Post('appointments/:id/attend')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'attendClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: AttendAppointmentDto })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async attend(@Param('id') id: string, @Body() body: AttendAppointmentDto) {
    return { data: await this.clinic.attend(id, body) };
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'cancelClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async cancel(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'CANCELLED') }; }

  @Post('appointments/:id/absent')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'markClinicalAppointmentAbsent' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiCreatedResponse({ type: ClinicalAppointmentEnvelopeDto })
  async absent(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'ABSENT') }; }

  private actor(request: { athletaUserId?: string }): string {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    return request.athletaUserId;
  }
}
