import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import {
  AppointmentDto,
  AttendAppointmentDto,
  CorrectAppointmentDto,
  DirectAttentionDto,
  PatientDto,
  RescheduleAppointmentDto,
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
  async patients() { return { data: await this.clinic.listPatients() }; }

  @Get('services')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'listClinicalAppointmentServices' })
  async services() { return { data: await this.clinic.listServices() }; }

  @Post('appointments')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'createClinicalAppointment' })
  @ApiBody({ type: AppointmentDto })
  async create(@Body() body: AppointmentDto) { return { data: await this.clinic.create(body) }; }

  @Post('attentions')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'registerDirectClinicalAttention' })
  @ApiBody({ type: DirectAttentionDto })
  async directAttention(@Body() body: DirectAttentionDto) { return { data: await this.clinic.registerDirectAttention(body) }; }

  @Get('attentions')
  @RequirePermissions('CLINICAL_HISTORY_READ')
  @ApiOperation({ operationId: 'listClinicalAttentions' })
  @ApiQuery({ name: 'personId', required: false, type: String, format: 'uuid' })
  async attentions(@Query('personId') personId?: string) { return { data: await this.clinic.listAttentions(personId) }; }

  @Get('appointments')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'listClinicalAppointments' })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'personId', required: false, type: String, format: 'uuid' })
  async list(@Query('from') from?: string, @Query('to') to?: string, @Query('personId') personId?: string) {
    return { data: await this.clinic.list(from, to, personId) };
  }

  @Get('appointments/:id')
  @RequirePermissions('CLINIC_OPERATIONAL_READ')
  @ApiOperation({ operationId: 'getClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async detail(@Param('id') id: string) { return { data: await this.clinic.detail(id) }; }

  @Post('appointments/:id/reschedule')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'rescheduleClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: RescheduleAppointmentDto })
  async reschedule(@Param('id') id: string, @Body() body: RescheduleAppointmentDto) {
    return { data: await this.clinic.reschedule(id, body) };
  }

  @Post('appointments/:id/correct')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'correctClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CorrectAppointmentDto })
  async correct(@Param('id') id: string, @Body() body: CorrectAppointmentDto) {
    return { data: await this.clinic.correct(id, body.status) };
  }

  @Post('appointments/:id/attend')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'attendClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: AttendAppointmentDto })
  async attend(@Param('id') id: string, @Body() body: AttendAppointmentDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.clinic.attend(id, body, this.actor(request)) };
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'cancelClinicalAppointment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async cancel(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'CANCELLED') }; }

  @Post('appointments/:id/absent')
  @RequirePermissions('CLINIC_APPOINTMENT_MANAGE')
  @ApiOperation({ operationId: 'markClinicalAppointmentAbsent' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async absent(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'ABSENT') }; }

  private actor(request: { athletaUserId?: string }): string {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    return request.athletaUserId;
  }
}
