import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Resend } from 'resend';
import { DatabaseService } from '../../common/database/database.service';
import {
  assertSupportedEmailTrigger,
  EMAIL_TRIGGER_PAYLOAD_CONTRACTS,
  normalizeEmailTriggerVariables,
  type SupportedEmailAutomationTriggerId,
} from './email-trigger-payload.contracts';

@Injectable()
export class CommunicationEmailService {
  private readonly logger = new Logger(CommunicationEmailService.name);

  constructor(private readonly db: DatabaseService) {}

  private iso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') return v;
    return v != null ? String(v) : '';
  }

  async listTemplates(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, category, subject, body, variables, "linkedTriggerId"
       FROM email_templates
       ORDER BY name ASC`,
    );
    return r.rows.map((row) => ({
      ...row,
      variables: Array.isArray(row.variables) ? row.variables : [],
      linkedTriggerId:
        row.linkedTriggerId != null && String(row.linkedTriggerId) !== ''
          ? String(row.linkedTriggerId)
          : undefined,
    }));
  }

  async listCampaigns(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, subject, body, status, "triggerType", "scheduledAt",
              "eventRelativeConfig", "audienceFilter", attachments, stats, "createdAt", "createdBy"
       FROM email_campaigns
       ORDER BY "createdAt" DESC`,
    );
    return r.rows.map((row) => this.mapCampaignRow(row));
  }

  async createCampaign(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = String(body.id ?? '');
    if (!id) throw new Error('campaign id required');

    await this.db.query(
      `INSERT INTO email_campaigns (
        id, name, subject, body, status, "triggerType", "scheduledAt",
        "eventRelativeConfig", "audienceFilter", attachments, stats, "createdAt", "createdBy"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::timestamptz,$13)`,
      [
        id,
        String(body.name ?? ''),
        String(body.subject ?? ''),
        String(body.body ?? ''),
        String(body.status ?? 'DRAFT'),
        String(body.triggerType ?? 'IMMEDIATE'),
        body.scheduledAt != null && String(body.scheduledAt) !== ''
          ? String(body.scheduledAt)
          : null,
        body.eventRelativeConfig ?? null,
        body.audienceFilter ?? {},
        body.attachments ?? null,
        body.stats ?? {},
        this.iso(body.createdAt ?? new Date()),
        String(body.createdBy ?? 'Admin'),
      ],
    );

    const one = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, subject, body, status, "triggerType", "scheduledAt",
              "eventRelativeConfig", "audienceFilter", attachments, stats, "createdAt", "createdBy"
       FROM email_campaigns WHERE id = $1`,
      [id],
    );
    return this.mapCampaignRow(one.rows[0] ?? {});
  }

  async listLogs(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, "templateId", "campaignId", "recipientEmail", subject, "sentAt", status, "openedAt", metadata
       FROM email_logs
       ORDER BY "sentAt" DESC`,
    );
    return r.rows.map((row) => ({
      ...row,
      sentAt: this.iso(row.sentAt),
      openedAt:
        row.openedAt != null && String(row.openedAt) !== ''
          ? this.iso(row.openedAt)
          : undefined,
    }));
  }

  async createLog(body: Record<string, unknown>): Promise<void> {
    const id = String(body.id ?? '');
    if (!id) throw new Error('log id required');

    await this.db.query(
      `INSERT INTO email_logs (
        id, "templateId", "campaignId", "recipientEmail", subject, "sentAt", status, "openedAt", metadata
      ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8::timestamptz,$9::jsonb)`,
      [
        id,
        body.templateId != null ? String(body.templateId) : null,
        body.campaignId != null ? String(body.campaignId) : null,
        String(body.recipientEmail ?? ''),
        String(body.subject ?? ''),
        this.iso(body.sentAt ?? new Date()),
        String(body.status ?? 'SUCCESS'),
        body.openedAt != null && String(body.openedAt) !== ''
          ? String(body.openedAt)
          : null,
        body.metadata ?? null,
      ],
    );
  }

  /**
   * Resolve `email_templates.linkedTriggerId`, merge variables per central contract,
   * send via Resend, write `email_logs`.
   */
  async sendTransactionalByTrigger(body: Record<string, unknown>): Promise<{
    ok: true;
    logId: string;
    templateId: string;
  }> {
    const triggerId = String(body.triggerId ?? '').trim();
    if (!triggerId) {
      throw new BadRequestException('triggerId is required');
    }
    assertSupportedEmailTrigger(triggerId);

    const vars = normalizeEmailTriggerVariables(
      triggerId as SupportedEmailAutomationTriggerId,
      (body.variables && typeof body.variables === 'object'
        ? (body.variables as Record<string, unknown>)
        : {}) ?? {},
    );

    const contractRow = await this.db.query<Record<string, unknown>>(
      `SELECT id, subject, body
       FROM email_templates
       WHERE "linkedTriggerId" = $1
       LIMIT 1`,
      [triggerId],
    );

    if (contractRow.rows.length === 0) {
      throw new NotFoundException(
        `No email template linked to trigger "${triggerId}". Link one in the database (linkedTriggerId).`,
      );
    }

    const row = contractRow.rows[0]!;
    const templateId = String(row.id ?? '');
    let subject = String(row.subject ?? '');
    let html = String(row.body ?? '');

    for (const [key, val] of Object.entries(vars)) {
      const re = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      subject = subject.replace(re, val);
      html = html.replace(re, val);
    }

    const logId = `LOG-TRX-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const recipKey =
      EMAIL_TRIGGER_PAYLOAD_CONTRACTS[triggerId as SupportedEmailAutomationTriggerId]
        .recipientEmailKey;
    const to = vars[recipKey];

    try {
      await this.dispatchWithResend(to, subject, html);
      await this.createLog({
        id: logId,
        templateId,
        recipientEmail: to,
        subject,
        sentAt: new Date(),
        status: 'SUCCESS',
        metadata: { triggerId, variables: vars },
      });
      return { ok: true, logId, templateId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `sendTransactionalByTrigger failed trigger=${triggerId} to=${to}: ${message}`,
      );
      await this.createLog({
        id: logId,
        templateId,
        recipientEmail: to,
        subject,
        sentAt: new Date(),
        status: 'FAILED',
        metadata: { triggerId, variables: vars, error: message },
      });
      throw err;
    }
  }

  private async dispatchWithResend(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() ?? 'onboarding@resend.dev';
    if (!resendKey) {
      throw new ServiceUnavailableException(
        'Transactional email is not configured (RESEND_API_KEY).',
      );
    }
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });
    if (error) {
      throw new BadRequestException(`Email provider error: ${error.message}`);
    }
  }

  private mapCampaignRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...row,
      scheduledAt:
        row.scheduledAt != null && String(row.scheduledAt) !== ''
          ? this.iso(row.scheduledAt)
          : undefined,
      createdAt: this.iso(row.createdAt),
    };
  }
}
