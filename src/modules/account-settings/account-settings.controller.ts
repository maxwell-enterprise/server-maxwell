import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccountSettingsService } from './account-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';

type PatchBody = {
  emailTransactional?: boolean;
  emailMarketing?: boolean;
  smsAlerts?: boolean;
};

@Controller('account-settings')
@UseGuards(JwtAuthGuard)
export class AccountSettingsController {
  constructor(private readonly accountSettings: AccountSettingsService) {}

  private assertSelfOrSuperAdmin(
    req: { user: JwtUserPayload },
    targetUserId: string,
  ) {
    const isSelf = req.user.sub === targetUserId;
    const isSuperAdmin = String(req.user.role).toUpperCase() === 'SUPER_ADMIN';
    if (!isSelf && !isSuperAdmin) {
      throw new ForbiddenException(
        'You are not allowed to access another user notification preferences.',
      );
    }
  }

  @Get('me/notification-preferences')
  getMyNotificationPreferences(@Req() req: { user: JwtUserPayload }) {
    return this.accountSettings.getNotificationPreferences(req.user.sub);
  }

  @Patch('me/notification-preferences')
  patchMyNotificationPreferences(
    @Req() req: { user: JwtUserPayload },
    @Body() body: PatchBody,
  ) {
    return this.accountSettings.upsertNotificationPreferences(req.user.sub, {
      emailTransactional: body.emailTransactional,
      emailMarketing: body.emailMarketing,
      smsAlerts: body.smsAlerts,
    });
  }

  @Get('users/:userId/notification-preferences')
  getNotificationPreferences(
    @Req() req: { user: JwtUserPayload },
    @Param('userId') userId: string,
  ) {
    this.assertSelfOrSuperAdmin(req, userId);
    return this.accountSettings.getNotificationPreferences(userId);
  }

  @Patch('users/:userId/notification-preferences')
  patchNotificationPreferences(
    @Req() req: { user: JwtUserPayload },
    @Param('userId') userId: string,
    @Body() body: PatchBody,
  ) {
    this.assertSelfOrSuperAdmin(req, userId);
    return this.accountSettings.upsertNotificationPreferences(userId, {
      emailTransactional: body.emailTransactional,
      emailMarketing: body.emailMarketing,
      smsAlerts: body.smsAlerts,
    });
  }
}
