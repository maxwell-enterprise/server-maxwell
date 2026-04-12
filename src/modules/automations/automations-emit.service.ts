import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemAdminService } from '../system-admin/system-admin.service';

/**
 * Handles `POST /fe/automations/emit` — queues welcome email + background job + journey log.
 */
@Injectable()
export class AutomationsEmitService {
  constructor(private readonly systemAdmin: SystemAdminService) {}

  async emit(body: {
    triggerId: string;
    payload: Record<string, unknown>;
  }): Promise<{ ok: true; queueId: string; backgroundJobId: string }> {
    const triggerId = String(body.triggerId ?? '').trim();
    const payload =
      body.payload && typeof body.payload === 'object' ? body.payload : {};

    if (
      triggerId !== 'NEW_MEMBER' &&
      triggerId !== 'NEW_MEMBER_REGISTRATION'
    ) {
      throw new BadRequestException(
        `Unsupported triggerId for emit: ${triggerId}`,
      );
    }

    const member_name = String(
      payload.member_name ?? payload.name ?? '',
    ).trim();
    const email = String(payload.email ?? '').trim();
    if (!member_name || !email) {
      throw new BadRequestException(
        'Payload must include member_name (or name) and email',
      );
    }

    const memberId =
      payload.memberId != null ? String(payload.memberId).trim() : '';
    const join_date = String(
      payload.join_date ?? new Date().toISOString().slice(0, 10),
    ).trim();
    const phone = String(payload.phone ?? '').trim();

    const queueId = `Q-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const contextData: Record<string, unknown> = {
      emailTriggerId: 'EMAIL_WELCOME_SENT',
      templateId: 'TPL-EMAIL-WELCOME',
      memberId: memberId || undefined,
      member_name,
      name: member_name,
      email,
      phone,
      join_date,
    };

    await this.systemAdmin.upsertAutomationQueueItem(queueId, {
      triggerType: 'EMAIL',
      contextData,
      description: `Welcome email → ${email} (${member_name})`,
      status: 'PENDING',
    });

    const job = await this.systemAdmin.insertBackgroundJob({
      type: 'EMAIL',
      payload: {
        kind: 'WELCOME_EMAIL',
        templateId: 'TPL-EMAIL-WELCOME',
        queueId,
        memberId: memberId || null,
        email,
        triggerId,
      },
      status: 'QUEUED',
    });

    if (memberId) {
      await this.systemAdmin.appendMemberJourneyLog({
        memberId,
        category: 'SYSTEM',
        action: 'Welcome email queued',
        details: `Automation queued welcome email to ${email}`,
        metadata: { queueId, backgroundJobId: job.id, triggerId },
      });
    }

    return { ok: true, queueId, backgroundJobId: job.id };
  }
}
