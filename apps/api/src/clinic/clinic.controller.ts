import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { ClinicService } from './clinic.service';
import { AppointmentDto, PatientDto, RescheduleAppointmentDto, CorrectAppointmentDto } from './clinic.dto';
@ApiTags('Clinic') @Controller('clinic') @UseGuards(PermissionsGuard)
export class ClinicController { constructor(private readonly clinic: ClinicService) {} private actor(req: { athletaUserId?: string }) { if (!req.athletaUserId) throw new Error('actor'); return req.athletaUserId; }
 @Post('patients') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiOperation({ operationId: 'registerClinicalPatient' }) register(@Body() b: PatientDto, @Req() r: { athletaUserId?: string }) { return { data: this.clinic.registerPatient(b.personId, this.actor(r)) }; }
 @Post('appointments') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiOperation({ operationId: 'createClinicalAppointment' }) create(@Body() b: AppointmentDto) { return { data: this.clinic.create(b) }; }
 @Get('appointments') @RequirePermissions('CLINIC_OPERATIONAL_READ') @ApiOperation({ operationId: 'listClinicalAppointments' }) list(@Query('from') from?: string, @Query('to') to?: string) { return { data: this.clinic.list(from, to) }; }
 @Get('appointments/:id') @RequirePermissions('CLINIC_OPERATIONAL_READ') @ApiParam({name:'id',type:String}) detail(@Param('id') id:string) { return {data:this.clinic.detail(id)}; }
 @Post('appointments/:id/reschedule') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) reschedule(@Param('id') id:string,@Body() b:RescheduleAppointmentDto) { return {data:this.clinic.reschedule(id,b)}; }
 @Post('appointments/:id/correct') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) correct(@Param('id') id:string,@Body() b:CorrectAppointmentDto) { return {data:this.clinic.correct(id,b.status)}; }
 @Post('appointments/:id/attend') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({name:'id',type:String}) attend(@Param('id') id:string,@Req() r:{athletaUserId?:string}) { return {data:this.clinic.attend(id,this.actor(r))}; }
 @Post('appointments/:id/cancel') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({ name: 'id', type: String }) cancel(@Param('id') id: string) { return { data: this.clinic.transition(id, 'CANCELLED') }; }
 @Post('appointments/:id/absent') @RequirePermissions('CLINIC_APPOINTMENT_MANAGE') @ApiParam({ name: 'id', type: String }) absent(@Param('id') id: string) { return { data: this.clinic.transition(id, 'ABSENT') }; }
}
