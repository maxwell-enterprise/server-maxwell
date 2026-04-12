import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertAutomationEmitAllowed } from '../../common/security/access-policy';
import { AutomationsEmitService } from './automations-emit.service';

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
    const triggerId = String(body.triggerId ?? '');
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : {};
    return this.automationsEmit.emit({ triggerId, payload });
  }
}
