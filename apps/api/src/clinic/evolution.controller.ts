import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { EvolutionDto } from './clinic.dto';
import { EvolutionService } from './evolution.service';

@ApiTags('Clinic Evolutions')
@Controller('clinic')
@UseGuards(PermissionsGuard)
export class EvolutionController {
  constructor(private readonly evolutions: EvolutionService) {}

  @Post('attentions/:attentionId/evolution')
  @RequirePermissions('CLINIC_EVOLUTION_MANAGE')
  @ApiOperation({ operationId: 'createClinicalEvolution' })
  @ApiParam({ name: 'attentionId', type: String, format: 'uuid' })
  @ApiBody({ type: EvolutionDto })
  async create(@Param('attentionId') id: string, @Body() body: EvolutionDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.evolutions.create(id, this.actor(request), body) };
  }

  @Get('attentions/:attentionId/evolution')
  @RequirePermissions('CLINICAL_HISTORY_READ')
  @ApiOperation({ operationId: 'getClinicalEvolutionForAttention' })
  @ApiParam({ name: 'attentionId', type: String, format: 'uuid' })
  async get(@Param('attentionId') id: string) { return { data: await this.evolutions.get(id) }; }

  @Patch('evolutions/:id')
  @RequirePermissions('CLINIC_EVOLUTION_MANAGE')
  @ApiOperation({ operationId: 'correctClinicalEvolution' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: EvolutionDto })
  async update(@Param('id') id: string, @Body() body: EvolutionDto, @Req() request: { athletaUserId?: string }) {
    return { data: await this.evolutions.update(id, this.actor(request), body) };
  }

  private actor(request: { athletaUserId?: string }): string {
    if (!request.athletaUserId) throw new Error('Authenticated actor missing');
    return request.athletaUserId;
  }
}
