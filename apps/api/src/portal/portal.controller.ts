import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PortalService } from './portal.service';
@ApiTags('Portal') @Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}
  private cookie(req: Request) { return req.cookies?.athleta_portal_session as string | undefined; }
  @Post('auth/login') @HttpCode(200) async login(@Body() body: { dni: string; pin: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.portal.login(body.dni, body.pin); res.cookie('athleta_portal_session', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging', path: '/' }); return { data: { ...result, token: undefined } }; }
  @Post('auth/logout') @HttpCode(200) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.portal.logout(this.cookie(req)); res.clearCookie('athleta_portal_session', { path: '/' }); return { data: {} }; }
  @Get('auth/session') async session(@Req() req: Request) { const c = await this.portal.current(this.cookie(req)); return { data: { person: this.portal.profile(c.person), mustChangePin: c.person.portalCredential?.mustChangePin ?? false, csrfToken: c.session.csrfToken } }; }
  @Post('auth/change-pin') @HttpCode(200) async change(@Req() req: Request, @Body() body: { currentPin: string; nextPin: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.changePin(this.cookie(req), body.currentPin, body.nextPin) }; }
  @Get('me') async me(@Req() req: Request) { return { data: await this.portal.me(this.cookie(req)) }; }
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
  @Post('sala/fixed-bookings') @HttpCode(201) async createFixed(@Req() req: Request, @Body() body: { scheduleSlotId: string; serviceTypeId?: string; startTime?: string; startDate: string; endDate?: string|null; csrfToken?: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token') ?? body.csrfToken); return { data: await this.portal.createFixed(this.cookie(req), body) }; }
  @Post('sala/fixed-bookings/:id/change') @ApiParam({ name: 'id', type: String }) async changeFixed(@Req() req: Request, @Param('id') id: string, @Body() body: { scheduleSlotId: string; serviceTypeId?: string; startTime?: string; startDate: string; endDate?: string|null; csrfToken?: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token') ?? body.csrfToken); return { data: await this.portal.changeFixed(this.cookie(req), id, body) }; }
  @Post('sala/fixed-bookings/:id/end') @ApiParam({ name: 'id', type: String }) async endFixed(@Req() req: Request, @Param('id') id: string, @Body() body: { endDate: string; csrfToken?: string }) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token') ?? body.csrfToken); return { data: await this.portal.endFixed(this.cookie(req), id, body.endDate) }; }
  @Get('clinic/appointments') async appointments(@Req() req: Request) { return { data: await this.portal.clinicalAppointments(this.cookie(req)) }; }
  @Post('clinic/appointments/:id/cancel') @ApiParam({ name: 'id', type: String }) @HttpCode(200) async cancel(@Req() req: Request, @Param('id') id: string) { await this.portal.assertCsrf(this.cookie(req), req.header('x-csrf-token')); return { data: await this.portal.cancelClinical(this.cookie(req), id) }; }
}
