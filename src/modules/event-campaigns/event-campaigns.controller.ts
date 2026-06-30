import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertCampaignResourceAccess } from '../../common/security/access-policy';
import { EventCampaignsService } from './event-campaigns.service';

@Controller('event-campaigns')
@UseGuards(JwtAuthGuard)
export class EventCampaignsController {
  constructor(private readonly eventCampaigns: EventCampaignsService) {}

  @Get()
  list(@Req() req: { user: JwtUserPayload }) {
    assertCampaignResourceAccess(req.user, 'Event campaign list');
    return this.eventCampaigns.listCampaigns();
  }

  @Get('analytics/summary')
  analyticsSummary(@Req() req: { user: JwtUserPayload }) {
    assertCampaignResourceAccess(req.user, 'Event campaign analytics');
    return this.eventCampaigns.getAnalyticsSummary();
  }

  @Get('forms/:formId/respondents')
  formRespondents(
    @Req() req: { user: JwtUserPayload },
    @Param('formId') formId: string,
  ) {
    assertCampaignResourceAccess(req.user, 'Event campaign respondents');
    return this.eventCampaigns.listFormRespondents(decodeURIComponent(formId));
  }

  @Post('send')
  send(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertCampaignResourceAccess(req.user, 'Event campaign send');
    return this.eventCampaigns.sendCampaign(req.user.sub, body ?? {});
  }
}

@Controller('me/event-campaigns')
@UseGuards(JwtAuthGuard)
export class EventCampaignsMeController {
  constructor(private readonly eventCampaigns: EventCampaignsService) {}

  @Get('pending')
  pending(@Req() req: { user: JwtUserPayload }) {
    return this.eventCampaigns.getPendingForUser(
      req.user.sub,
      req.user.email,
    );
  }

  @Post(':assignmentId/dismiss')
  dismiss(
    @Req() req: { user: JwtUserPayload },
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.eventCampaigns.dismissAssignment(
      req.user.sub,
      req.user.email,
      decodeURIComponent(assignmentId),
    );
  }
}
