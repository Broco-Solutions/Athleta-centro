import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { CreatePersonDto, ListPeopleQueryDto, PeopleListEnvelopeDto, PersonEnvelopeDto, UpdatePersonDto } from './person.dto';
import { PeopleService } from './people.service';

@ApiTags('People') @Controller('people') @UseGuards(PermissionsGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}
  @Get() @RequirePermissions('PEOPLE_READ') @ApiOperation({ operationId: 'listPeople' }) @ApiQuery({ name: 'search', type: String, required: false }) @ApiQuery({ name: 'page', type: Number, required: false }) @ApiQuery({ name: 'pageSize', type: Number, required: false }) @ApiOkResponse({ type: PeopleListEnvelopeDto }) list(@Query() query: ListPeopleQueryDto) { return this.people.list(query); }
  @Get(':id') @RequirePermissions('PEOPLE_READ') @ApiOperation({ operationId: 'getPerson' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: PersonEnvelopeDto }) async get(@Param('id') id: string) { return { data: await this.people.get(id) }; }
  @Post() @RequirePermissions('PEOPLE_CREATE') @ApiOperation({ operationId: 'createPerson' }) @ApiBody({ type: CreatePersonDto }) @ApiCreatedResponse({ type: PersonEnvelopeDto }) async create(@Body() body: CreatePersonDto) { return { data: await this.people.create(body) }; }
  @Patch(':id') @RequirePermissions('PEOPLE_UPDATE_GENERAL') @ApiOperation({ operationId: 'updatePerson' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: UpdatePersonDto }) @ApiOkResponse({ type: PersonEnvelopeDto }) async update(@Param('id') id: string, @Body() body: UpdatePersonDto) { return { data: await this.people.update(id, body) }; }
}
