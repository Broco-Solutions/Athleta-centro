import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PortalService } from './portal.service';
@ApiTags('Portal') @Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}
  private cookie(req: Request) { return req.cookies?.athleta_portal_session as string | undefined; }
  @Post('auth/login') @HttpCode(200) async login(@Body() body: { dni: string; pin: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.portal.login(body.dni, body.pin); res.cookie('athleta_portal_session', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging', path: '/' }); return { data: { ...result, token: undefined } }; }
  @Post('auth/logout') @HttpCode(200) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.portal.logout(this.cookie(req)); res.clearCookie('athleta_portal_session', { path: '/' }); return { data: {} }; }
  @Get('auth/session') async session(@Req() req: Request) { const c = await this.portal.current(this.cookie(req)); return { data: { person: this.portal.profile(c.person), mustChangePin: c.person.portalCredential?.mustChangePin ?? false, csrfToken: c.session.csrfToken } }; }
  @Post('auth/change-pin') @HttpCode(200) async change(@Req() req: Request, @Body() body: { currentPin: string; nextPin: string }) { return { data: await this.portal.changePin(this.cookie(req), body.currentPin, body.nextPin) }; }
  @Get('me') async me(@Req() req: Request) { return { data: await this.portal.me(this.cookie(req)) }; }
  @Get('sala') async sala(@Req() req: Request) { return { data: await this.portal.sala(this.cookie(req)) }; }
  @Get('clinic/appointments') async appointments(@Req() req: Request) { return { data: await this.portal.clinicalAppointments(this.cookie(req)) }; }
  @Post('clinic/appointments/:id/cancel') @ApiParam({ name: 'id', type: String }) @HttpCode(200) async cancel(@Req() req: Request, @Param('id') id: string) { return { data: await this.portal.cancelClinical(this.cookie(req), id) }; }
}
