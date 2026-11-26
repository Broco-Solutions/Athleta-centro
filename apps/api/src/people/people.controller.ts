import { Body, Controller, Get, Param, Patch, Post, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentActor, PermissionsGuard, RequirePermissions, type InternalActor } from '../auth/permissions.guard';
import { CreatePersonDto, ListPeopleQueryDto, PeopleListEnvelopeDto, PersonEnvelopeDto, PortalPinEnvelopeDto, UpdatePersonDto } from './person.dto';
import { PeopleService } from './people.service';

@ApiTags('People') @Controller('people') @UseGuards(PermissionsGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}
  @Get() @RequirePermissions('PEOPLE_READ') @ApiOperation({ operationId: 'listPeople' }) @ApiQuery({ name: 'search', type: String, required: false }) @ApiQuery({ name: 'page', type: Number, required: false }) @ApiQuery({ name: 'pageSize', type: Number, required: false }) @ApiOkResponse({ type: PeopleListEnvelopeDto }) list(@Query() query: ListPeopleQueryDto, @CurrentActor() actor: InternalActor) { return this.people.list(query, actor); }
  @Get(':id') @RequirePermissions('PEOPLE_READ') @ApiOperation({ operationId: 'getPerson' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: PersonEnvelopeDto }) async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: InternalActor) { return { data: await this.people.get(id, actor) }; }
  @Post() @RequirePermissions('PEOPLE_CREATE') @ApiOperation({ operationId: 'createPerson' }) @ApiBody({ type: CreatePersonDto }) @ApiCreatedResponse({ type: PersonEnvelopeDto }) async create(@Body() body: CreatePersonDto) { return { data: await this.people.create(body) }; }
  @Patch(':id') @RequirePermissions('PEOPLE_UPDATE_GENERAL') @ApiOperation({ operationId: 'updatePerson' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: UpdatePersonDto }) @ApiOkResponse({ type: PersonEnvelopeDto }) async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePersonDto, @CurrentActor() actor: InternalActor) { return { data: await this.people.update(id, body, actor) }; }
  @Post(':id/inactivate') @RequirePermissions('PEOPLE_GLOBAL_INACTIVATE') @ApiOperation({ operationId: 'inactivatePerson' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) async inactivate(@Param('id') id: string, @Req() request: Request & { athletaUserId?: string }) { return { data: await this.people.inactivate(id, request.athletaUserId!) }; }
  @Post(':id/reset-portal-pin') @RequirePermissions('PORTAL_PIN_RESET') @ApiOperation({ operationId: 'resetPortalPin' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: PortalPinEnvelopeDto }) async resetPortalPin(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: InternalActor) { return { data: await this.people.resetPortalPin(id, actor) }; }
}
