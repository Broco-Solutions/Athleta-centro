import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { PlanDto, ScheduleExceptionDto, ScheduleSlotDto, UpdateSalaConfigurationDto } from './sala.dto';
import { SalaService } from './sala.service';
@ApiTags('Sala') @Controller('sala') @UseGuards(PermissionsGuard)
export class SalaController {
  constructor(private readonly sala: SalaService) {}
  @Get('configuration') @RequirePermissions('SALA_SCHEDULE_MANAGE') @ApiOperation({ operationId: 'getSalaConfiguration' }) async configuration() { return { data: await this.sala.configuration() }; }
  @Patch('configuration') @RequirePermissions('SALA_SCHEDULE_MANAGE') @ApiOperation({ operationId: 'updateSalaConfiguration' }) @ApiBody({ type: UpdateSalaConfigurationDto }) async updateConfiguration(@Body() body: UpdateSalaConfigurationDto) { return { data: await this.sala.updateConfiguration(body) }; }
  @Get('plans') @RequirePermissions('SALA_PLAN_CATALOG_MANAGE') @ApiOperation({ operationId: 'listSalaPlans' }) async plans() { return { data: await this.sala.listPlans() }; }
  @Post('plans') @RequirePermissions('SALA_PLAN_CATALOG_MANAGE') @ApiOperation({ operationId: 'createSalaPlan' }) async createPlan(@Body() body: PlanDto) { return { data: await this.sala.createPlan(body) }; }
  @Patch('plans/:id') @RequirePermissions('SALA_PLAN_CATALOG_MANAGE') @ApiOperation({ operationId: 'updateSalaPlan' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) async updatePlan(@Param('id') id: string, @Body() body: PlanDto) { return { data: await this.sala.updatePlan(id, body) }; }
  @Get('schedule') @RequirePermissions('SALA_SCHEDULE_MANAGE') @ApiOperation({ operationId: 'listSalaSchedule' }) async schedule() { return { data: await this.sala.listSlots() }; }
  @Post('schedule') @RequirePermissions('SALA_SCHEDULE_MANAGE') @ApiOperation({ operationId: 'createSalaScheduleSlot' }) async createSlot(@Body() body: ScheduleSlotDto) { return { data: await this.sala.createSlot(body) }; }
  @Post('schedule/:id/exceptions') @RequirePermissions('SALA_SCHEDULE_MANAGE') @ApiOperation({ operationId: 'createSalaScheduleException' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) async addException(@Param('id') id: string, @Body() body: ScheduleExceptionDto) { return { data: await this.sala.addException(id, body) }; }
}
