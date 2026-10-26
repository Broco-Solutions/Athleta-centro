import { CreateTrainingRecordDto, CorrectTrainingRecordDto, TrainingRecordQueryDto, TrainingContextQueryDto, TrainingContextEnvelopeDto, TrainingRecordEnvelopeDto, TrainingRecordListEnvelopeDto } from '../sala/training-record.dto';
import { SubmitHealthDeclarationDto, HealthDeclarationStatusEnvelopeDto, HealthDeclarationListEnvelopeDto, HealthDeclarationDetailEnvelopeDto, HealthDocumentEnvelopeDto } from '../sala/health-declaration/health-declaration.dto';
import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiQuery, ApiOperation, ApiOkResponse, ApiParam, ApiBody, ApiCreatedResponse, getSchemaPath, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PORTAL_SESSION_TTL_MS } from './portal-session';
import { PortalService } from './portal.service';
@ApiTags('Portal') @Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}
  private cookie(req: Request) { return req.cookies?.athleta_portal_session as string | undefined; }
  private setSessionCookie(res: Response, token: string) {
    res.cookie('athleta_portal_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging', path: '/', maxAge: PORTAL_SESSION_TTL_MS });
  }
  @Post('auth/login') @HttpCode(200) async login(@Body() body: { dni: string; pin: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.portal.login(body.dni, body.pin); this.setSessionCookie(res, result.token); return { data: { ...result, token: undefined } }; }
  @Post('auth/logout') @HttpCode(200) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.portal.logout(this.cookie(req)); res.clearCookie('athleta_portal_session', { path: '/' }); return { data: {} }; }
  @Get('auth/session') @ApiOkResponse({ schema: { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['person', 'mustChangePin', 'csrfToken', 'healthDeclaration'], properties: { person: { type: 'object', additionalProperties: true }, mustChangePin: { type: 'boolean' }, csrfToken: { type: 'string' }, healthDeclaration: { $ref: getSchemaPath('HealthDeclarationStatusDto') } } } } } }) async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) { const c = await this.portal.current(this.cookie(req)); this.setSessionCookie(res, this.cookie(req)!); return { data: { person: this.portal.profile(c.person), mustChangePin: c.person.portalCredential?.mustChangePin ?? false, csrfToken: c.session.csrfToken, healthDeclaration: await this.portal.healthStatus(this.cookie(req)) } }; }
  @Post('auth/change-pin') @HttpCode(200) async change(@Req() req: Request, @Body() body: { currentPin: string; nextPin: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.changePin(this.cookie(req), body.currentPin, body.nextPin) }; }
  @Get('me') async me(@Req() req: Request) { return { data: await this.portal.me(this.cookie(req)) }; }
  @Get('health-declaration/status') @ApiOperation({ operationId: 'getPortalHealthDeclarationStatus' }) @ApiOkResponse({ type: HealthDeclarationStatusEnvelopeDto })
  async healthStatus(@Req() req: Request) { return { data: await this.portal.healthStatus(this.cookie(req)) }; }
  @Get('health-declaration/document') @ApiOperation({ operationId: 'getPortalHealthDocument' }) @ApiOkResponse({ type: HealthDocumentEnvelopeDto })
  async healthDocument(@Req() req: Request) { return { data: await this.portal.healthDocument(this.cookie(req)) }; }
  @Get('health-declarations') @ApiOperation({ operationId: 'listPortalHealthDeclarations' }) @ApiOkResponse({ type: HealthDeclarationListEnvelopeDto })
  async healthHistory(@Req() req: Request) { return { data: await this.portal.healthHistory(this.cookie(req)) }; }
  @Get('health-declarations/:id') @ApiOperation({ operationId: 'getPortalHealthDeclaration' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: HealthDeclarationDetailEnvelopeDto })
  async healthDetail(@Req() req: Request, @Param('id') id: string) { return { data: await this.portal.healthDetail(this.cookie(req), id) }; }
  @Post('health-declarations/submit') @ApiOperation({ operationId: 'submitPortalHealthDeclaration' }) @ApiBody({ type: SubmitHealthDeclarationDto }) @ApiCreatedResponse({ type: HealthDeclarationStatusEnvelopeDto })
  async submitHealth(@Req() req: Request, @Body() body: SubmitHealthDeclarationDto) {
    await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token'));
    await this.portal.submitHealthDeclaration(this.cookie(req), body);
    return { data: await this.portal.healthStatus(this.cookie(req)) };
  }
  @Get('sala/training-context') @ApiOperation({ operationId: 'getPortalTrainingContext' }) @ApiQuery({ name: 'date', required: false, type: String, format: 'date' }) @ApiOkResponse({ type: TrainingContextEnvelopeDto })
  async trainingContext(@Req() req: Request, @Query() query: TrainingContextQueryDto) { return { data: await this.portal.trainingContext(this.cookie(req), query.date) }; }
  @Get('sala/training-records') @ApiOperation({ operationId: 'listPortalTrainingRecords' }) @ApiQuery({ name: 'page', required: false, type: Number }) @ApiQuery({ name: 'pageSize', required: false, type: Number }) @ApiOkResponse({ type: TrainingRecordListEnvelopeDto })
  async trainingList(@Req() req: Request, @Query() query: TrainingRecordQueryDto) { return this.portal.trainingList(this.cookie(req), query); }
  @Get('sala/training-records/:id') @ApiOperation({ operationId: 'getPortalTrainingRecord' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiOkResponse({ type: TrainingRecordEnvelopeDto })
  async trainingDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return { data: await this.portal.trainingDetail(this.cookie(req), id) }; }
  @Post('sala/training-records') @ApiOperation({ operationId: 'createPortalTrainingRecord' }) @ApiBody({ type: CreateTrainingRecordDto }) @ApiCreatedResponse({ type: TrainingRecordEnvelopeDto })
  async trainingCreate(@Req() req: Request, @Body() body: CreateTrainingRecordDto) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.trainingCreate(this.cookie(req), body) }; }
  @Post('sala/training-records/:id/correct') @HttpCode(200) @ApiOperation({ operationId: 'correctPortalTrainingRecord' }) @ApiParam({ name: 'id', type: String, format: 'uuid' }) @ApiBody({ type: CorrectTrainingRecordDto }) @ApiOkResponse({ type: TrainingRecordEnvelopeDto })
  async trainingCorrect(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: CorrectTrainingRecordDto) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.trainingCorrect(this.cookie(req), id, body) }; }
  @Get('sala') async sala(@Req() req: Request) { return { data: await this.portal.sala(this.cookie(req)) }; }
  @Get('sala/services') async salaServices(@Req() req: Request) { return { data: await this.portal.salaServices(this.cookie(req)) }; }
  @Get('sala/availability') async availability(@Req() req: Request) { const query = req.query as { date?: string; excludeFixedBookingId?: string }; return { data: await this.portal.salaAvailability(this.cookie(req), String(query.date ?? ''), query.excludeFixedBookingId) }; }
  @Post('sala/reservations') @HttpCode(201) async reserve(@Req() req: Request, @Body() body: { date: string; scheduleSlotId: string; serviceTypeId?: string; startTime?: string; csrfToken?: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token') ?? body.csrfToken); return { data: await this.portal.reserve(this.cookie(req), body) }; }
  @Post('sala/reservations/:id/cancel') @ApiParam({ name: 'id', type: String }) @HttpCode(200) async cancelReservation(@Req() req: Request, @Param('id') id: string) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.cancelReservation(this.cookie(req), id) }; }
  @Post('sala/fixed-bookings/:id/occurrences/:date/cancel')
  @ApiOperation({ operationId: 'cancelPortalFixedOccurrence', summary: 'Cancela una fecha futura propia sin finalizar la recurrencia semanal' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'date', type: String, format: 'date' })
  @ApiOkResponse({ schema: { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['id', 'fixedSalaBookingId', 'date', 'status'], properties: { id: { type: 'string', format: 'uuid' }, fixedSalaBookingId: { type: 'string', format: 'uuid' }, date: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['CANCELLED'] } } } } } })
  @HttpCode(200)
  async cancelFixedOccurrence(@Req() req: Request, @Param('id') id: string, @Param('date') date: string) {
    await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token'));
    return { data: await this.portal.cancelFixedOccurrence(this.cookie(req), id, date) };
  }
  @Get('sala/fixed-bookings') async fixed(@Req() req: Request) { return { data: await this.portal.fixedBookings(this.cookie(req)) }; }
  @Get('clinic/appointments') async appointments(@Req() req: Request) { return { data: await this.portal.clinicalAppointments(this.cookie(req)) }; }
  @Post('clinic/appointments/:id/cancel') @ApiParam({ name: 'id', type: String }) @HttpCode(200) async cancel(@Req() req: Request, @Param('id') id: string) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.cancelClinical(this.cookie(req), id) }; }
}
