import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { ClinicService } from './clinic.service';
import { AppointmentDto, PatientDto, RescheduleAppointmentDto, CorrectAppointmentDto } from './clinic.dto';
@ApiTags('Clinic') @Controller('clinic') @UseGuards(PermissionsGuard)
export class ClinicController { constructor(private readonly clinic: ClinicService) {} private actor(req: { athletaUserId?: string }) { if (!req.athletaUserId) throw new Error('actor'); return req.athletaUserId; }
 @Post('patients') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiOperation({ operationId: 'registerClinicalPatient' }) async register(@Body() b: PatientDto, @Req() r: { athletaUserId?: string }) { return { data: await this.clinic.registerPatient(b.personId, this.actor(r)) }; }
 @Post('appointments') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiOperation({ operationId: 'createClinicalAppointment' }) async create(@Body() b: AppointmentDto) { return { data: await this.clinic.create(b) }; }
 @Get('appointments') @RequirePermissions('CLINIC_OPERATIONAL_READ') @ApiOperation({ operationId: 'listClinicalAppointments' }) list(@Query('from') from?: string, @Query('to') to?: string) { return { data: this.clinic.list(from, to) }; }
 @Get('appointments/:id') @RequirePermissions('CLINIC_OPERATIONAL_READ') @ApiParam({name:'id',type:String}) async detail(@Param('id') id:string) { return {data:await this.clinic.detail(id)}; }
 @Post('appointments/:id/reschedule') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) async reschedule(@Param('id') id:string,@Body() b:RescheduleAppointmentDto) { return {data:await this.clinic.reschedule(id,b)}; }
 @Post('appointments/:id/correct') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) async correct(@Param('id') id:string,@Body() b:CorrectAppointmentDto) { return {data:await this.clinic.correct(id,b.status)}; }
 @Post('appointments/:id/attend') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) async attend(@Param('id') id:string,@Req() r:{athletaUserId?:string}) { return {data:await this.clinic.attend(id,this.actor(r))}; }
 @Post('appointments/:id/cancel') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({ name: 'id', type: String }) async cancel(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'CANCELLED') }; }
 @Post('appointments/:id/absent') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({ name: 'id', type: String }) async absent(@Param('id') id: string) { return { data: await this.clinic.transition(id, 'ABSENT') }; }
}
