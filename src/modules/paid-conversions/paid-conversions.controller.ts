import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaidConversionsService } from './paid-conversions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertRole } from '../../common/security/access-policy';
import { USER_ROLE } from '../workspace-identity/user-role.constants';

@Controller('paid-conversions')
export class PaidConversionsController {
  constructor(private readonly paidConversions: PaidConversionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @Req() req: { user: JwtUserPayload },
    @Query('search') search?: string,
    @Query('campaignSourceCode') campaignSourceCode?: string,
    @Query('campaignOnly') campaignOnly?: string,
    @Query('picMemberId') picMemberId?: string,
    @Query('eventType') eventType?: string,
    @Query('stageSegment') stageSegment?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    assertRole(
      req.user,
      [USER_ROLE.SUPER_ADMIN, USER_ROLE.SALES, USER_ROLE.MARKETING],
      'Paid conversions list',
    );
    const campaignOnlyFlag =
      campaignOnly === '1' ||
      campaignOnly === 'true' ||
      campaignOnly === 'yes';
    return this.paidConversions.list({
      search,
      campaignSourceCode,
      campaignOnly: campaignOnlyFlag,
      picMemberId,
      eventType,
      stageSegment,
      startDate,
      endDate,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('assign-pic')
  @UseGuards(JwtAuthGuard)
  assignPic(
    @Req() req: { user: JwtUserPayload },
    @Body()
    body: {
      subjectEmail?: string;
      subjectMemberId?: string;
      picMemberId?: string;
      picName?: string;
      notes?: string;
    },
  ) {
    assertRole(
      req.user,
      [USER_ROLE.SUPER_ADMIN, USER_ROLE.SALES, USER_ROLE.MARKETING],
      'PIC assignment',
    );
    return this.paidConversions.assignPic({
      subjectEmail: String(body.subjectEmail ?? ''),
      subjectMemberId: body.subjectMemberId,
      picMemberId: body.picMemberId,
      picName: body.picName,
      notes: body.notes,
      assignedBy: req.user?.email ?? req.user?.sub ?? undefined,
    });
  }

  @Post('track-sign-in')
  @UseGuards(JwtAuthGuard)
  trackSignIn(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { campaignSourceCode?: string; name?: string },
  ) {
    return this.paidConversions.recordForSignIn({
      email: req.user.email,
      name: body.name,
      campaignSourceCode: body.campaignSourceCode,
    });
  }
}
