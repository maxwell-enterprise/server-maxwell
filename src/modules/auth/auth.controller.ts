import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Get('google')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  google(@Res() res: Response) {
    const url = this.auth.buildGoogleAuthorizeUrl();
    return res.redirect(302, url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Missing code');
    }
    const token = await this.auth.handleGoogleCallback(code);
    const base = this.auth.getFrontendBaseUrl();
    return res.redirect(
      302,
      `${base}/auth/callback?token=${encodeURIComponent(token)}`,
    );
  }

  /** Public: returns `{ user }` or `{ user: null }` when no/invalid Bearer. */
  @Get('session')
  async session(@Req() req: Request) {
    const auth = req.headers.authorization;
    const bearer =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7)
        : null;
    if (!bearer) {
      return { user: null };
    }
    try {
      const p = this.jwt.verify(bearer) as { sub: string };
      const user = await this.auth.getSessionPayload(p.sub);
      return { user };
    } catch {
      return { user: null };
    }
  }

  @Post('email/send')
  @RateLimit({ limit: 6, windowMs: 60_000, keyBy: 'email' })
  async sendEmail(@Body() body: { email?: string }) {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email) {
      throw new BadRequestException('email required');
    }
    await this.auth.sendMagicLinkEmail(email);
    return { ok: true };
  }

  @Get('email/verify')
  async verifyEmail(
    @Query('email') email: string | undefined,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const base = this.auth.getFrontendBaseUrl();
    if (!email || !token) {
      return res.redirect(
        302,
        `${base}/auth/callback?error=${encodeURIComponent('missing_email_or_token')}`,
      );
    }
    try {
      const jwt = await this.auth.verifyEmailToken(email, token);
      return res.redirect(
        302,
        `${base}/auth/callback?token=${encodeURIComponent(jwt)}`,
      );
    } catch {
      return res.redirect(
        302,
        `${base}/auth/callback?error=${encodeURIComponent('invalid_or_expired_link')}`,
      );
    }
  }
}
