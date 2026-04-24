import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertAutomationEmitAllowed } from '../../common/security/access-policy';
import { AutomationsEmitService } from './automations-emit.service';

function readStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private readonly automationsEmit: AutomationsEmitService) {}

  /**
   * Event-driven entry: CRM / simulator → queue welcome email + system_background_jobs + journey log.
   */
  @Post('emit')
  emit(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertAutomationEmitAllowed(req.user, 'Automation emit');
    const triggerId = readStringField(body, 'triggerId');
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : {};
    return this.automationsEmit.emit({ triggerId, payload });
  }

  /**
   * Dev simulator entry: log any trigger into automation queue + background jobs.
   * Used by Automation Center (API mode) for PAYMENT_SUCCESS and other non-NEW_MEMBER triggers.
   */
  @Post('simulate')
  simulate(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertAutomationEmitAllowed(req.user, 'Automation simulate');
    const triggerId = readStringField(body, 'triggerId');
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : {};
    return this.automationsEmit.simulate({ triggerId, payload });
  }
}
