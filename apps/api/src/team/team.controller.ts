import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { PermissionsGuard, RequireAnyPermission, RequirePermissions } from '../auth/permissions.guard';
import { CreateTeamUserDto, TeamRoleDto, TeamUserCreatedDto, TeamUserEnvelopeDto, TeamUserListEnvelopeDto, UpdateTeamUserDto } from './team.dto';
import { TeamService } from './team.service';

@ApiTags('Team') @Controller('team/users') @UseGuards(PermissionsGuard)
export class TeamController {
  constructor(private readonly team: TeamService, private readonly auth: AuthService) {}
  @Get() @RequirePermissions('TEAM_READ') @ApiOperation({ operationId: 'listTeamUsers' }) @ApiOkResponse({ type: TeamUserListEnvelopeDto })
  async list() { return { data: await this.team.list() }; }
  @Get(':id') @RequirePermissions('TEAM_READ') @ApiOperation({ operationId: 'getTeamUser' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async get(@Param('id') id: string) { return { data: await this.team.get(id) }; }
  @Post() @RequireAnyPermission('TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE') @ApiOperation({ operationId: 'createTeamUser' }) @ApiBody({ type: CreateTeamUserDto }) @ApiCreatedResponse({ type: TeamUserCreatedDto })
  async create(@Body() body: CreateTeamUserDto, @Req() request: Request) { const actor = await this.current(request); return this.team.create(body, actor.permissions); }
  @Patch(':id') @ApiOperation({ operationId: 'updateTeamUser' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: UpdateTeamUserDto }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async update(@Param('id') id: string, @Body() body: UpdateTeamUserDto, @Req() request: Request) { const actor = await this.current(request); return { data: await this.team.update(id, body, actor.user.id, actor.permissions) }; }
  @Post(':id/roles') @HttpCode(200) @RequireAnyPermission('TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE') @ApiOperation({ operationId: 'addTeamUserRole' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: TeamRoleDto }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async addRole(@Param('id') id: string, @Body() body: TeamRoleDto, @Req() request: Request) { const actor = await this.current(request); return { data: await this.team.addRole(id, body.role, actor.permissions) }; }
  @Post(':id/roles/remove') @HttpCode(200) @RequireAnyPermission('TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE') @ApiOperation({ operationId: 'removeTeamUserRole' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: TeamRoleDto }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async removeRole(@Param('id') id: string, @Body() body: TeamRoleDto, @Req() request: Request) { const actor = await this.current(request); return { data: await this.team.removeRole(id, body.role, actor.permissions) }; }
  @Post(':id/inactivate') @HttpCode(200) @RequireAnyPermission('TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE') @ApiOperation({ operationId: 'inactivateTeamUser' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async inactivate(@Param('id') id: string, @Req() request: Request) { const actor = await this.current(request); return { data: await this.team.inactivate(id, actor.permissions) }; }
  @Post(':id/reactivate') @HttpCode(200) @RequireAnyPermission('TEAM_STANDARD_USER_MANAGE', 'TEAM_GENERAL_ADMIN_MANAGE') @ApiOperation({ operationId: 'reactivateTeamUser' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: TeamUserEnvelopeDto })
  async reactivate(@Param('id') id: string, @Req() request: Request) { const actor = await this.current(request); return { data: await this.team.reactivate(id, actor.permissions) }; }
  private async current(request: Request) { return (await this.auth.current(request.cookies?.athleta_session)).session; }
}
