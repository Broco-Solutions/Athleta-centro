import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, INTERNAL_SESSION_TTL_MS } from './auth.service';
import { credentialsRequestSchema, passwordChangeRequestSchema } from './auth.openapi';
@ApiTags('Auth')
@Controller('auth') export class AuthController { constructor(private readonly auth: AuthService) {}
  private setSessionCookie(response: Response, token: string) {
    response.cookie('athleta_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging', path: '/', maxAge: INTERNAL_SESSION_TTL_MS });
  }
  @Post('login') @HttpCode(200) @ApiOperation({ operationId: 'internalLogin' }) @ApiBody({ schema: credentialsRequestSchema }) async login(@Body() body: { email: string; password: string }, @Req() request: Request, @Res({ passthrough: true }) response: Response) { const result = await this.auth.login(body.email, body.password, request.ip ?? 'unknown'); this.setSessionCookie(response, result.token); return { data: { ...result.session, csrfToken: result.csrfToken } }; }
  @Get('session') @ApiOperation({ operationId: 'getInternalSession' }) async session(@Req() request: Request, @Res({ passthrough: true }) response: Response) { const current = await this.auth.current(request.cookies?.athleta_session); this.setSessionCookie(response, request.cookies.athleta_session); return { data: { ...current.session, csrfToken: current.csrfToken } }; }
  @Post('logout') @HttpCode(200) @ApiOperation({ operationId: 'internalLogout' }) async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { await this.auth.logout(request.cookies?.athleta_session); response.clearCookie('athleta_session', { path: '/' }); return { data: {} }; }
  @Post('change-password') @HttpCode(200) @ApiOperation({ operationId: 'changeInternalPassword' }) @ApiBody({ schema: passwordChangeRequestSchema }) async change(@Req() request: Request, @Headers('x-csrf-token') csrf: string | undefined, @Body() body: { currentPassword: string; nextPassword: string }) { const current = await this.auth.current(request.cookies?.athleta_session); if (!csrf || csrf !== current.csrfToken) throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' }); return { data: await this.auth.changePassword(request.cookies?.athleta_session, body.currentPassword, body.nextPassword) }; }
}
