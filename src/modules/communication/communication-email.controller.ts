import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CommunicationEmailService } from './communication-email.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertMarketingOnly,
  assertMarketingOrSuperAdmin,
} from '../../common/security/access-policy';

@Controller('communication/email')
export class CommunicationEmailController {
  constructor(private readonly email: CommunicationEmailService) {}

  @Get('templates')
  listTemplates() {
    return this.email.listTemplates();
  }

  @Get('campaigns')
  listCampaigns() {
    return this.email.listCampaigns();
  }

  @Post('campaigns')
  @UseGuards(JwtAuthGuard)
  createCampaign(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'Email campaign creation');
    return this.email.createCampaign(body ?? {});
  }

  @Get('logs')
  listLogs() {
    return this.email.listLogs();
  }

  @Post('logs')
  @UseGuards(JwtAuthGuard)
  createLog(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'Email log creation');
    return this.email.createLog(body ?? {});
  }

  /**
   * Production transactional send: resolves template by `linkedTriggerId`, validates payload
   * against the central contract, sends via Resend, writes `email_logs`.
   */
  @Post('send-by-trigger')
  @UseGuards(JwtAuthGuard)
  sendByTrigger(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOrSuperAdmin(
      req.user,
      'Send transactional email by automation trigger',
    );
    return this.email.sendTransactionalByTrigger(body ?? {});
  }
}
