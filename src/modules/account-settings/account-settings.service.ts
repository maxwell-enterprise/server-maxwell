import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';

export type NotificationPreferencesDto = {
  emailTransactional: boolean;
  emailMarketing: boolean;
  smsAlerts: boolean;
};

const DEFAULTS: NotificationPreferencesDto = {
  emailTransactional: false,
  emailMarketing: false,
  smsAlerts: false,
};

@Injectable()
export class AccountSettingsService {
  constructor(private readonly db: DbService) {}

  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferencesDto> {
    const result = await this.db.query<NotificationPreferencesDto>(
      `
      select
        "emailTransactional",
        "emailMarketing",
        "smsAlerts"
      from user_notification_preferences
      where "userId" = $1
      `,
      [userId],
    );

    const row = result.rows[0];
    if (!row) {
      return { ...DEFAULTS };
    }

    return {
      emailTransactional: !!row.emailTransactional,
      emailMarketing: !!row.emailMarketing,
      smsAlerts: !!row.smsAlerts,
    };
  }

  async upsertNotificationPreferences(
    userId: string,
    patch: Partial<NotificationPreferencesDto>,
  ): Promise<NotificationPreferencesDto> {
    const current = await this.getNotificationPreferences(userId);
    const next: NotificationPreferencesDto = {
      emailTransactional:
        patch.emailTransactional ?? current.emailTransactional,
      emailMarketing: patch.emailMarketing ?? current.emailMarketing,
      smsAlerts: patch.smsAlerts ?? current.smsAlerts,
    };

    await this.db.query(
      `
      insert into user_notification_preferences (
        "userId",
        "emailTransactional",
        "emailMarketing",
        "smsAlerts",
        "updatedAt"
      )
      values ($1, $2, $3, $4, now())
      on conflict ("userId") do update set
        "emailTransactional" = excluded."emailTransactional",
        "emailMarketing" = excluded."emailMarketing",
        "smsAlerts" = excluded."smsAlerts",
        "updatedAt" = now()
      `,
      [
        userId,
        next.emailTransactional,
        next.emailMarketing,
        next.smsAlerts,
      ],
    );

    return next;
  }
}
