import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Injectable()
export class CommunicationEmailService {
  constructor(private readonly db: DatabaseService) {}

  private iso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') return v;
    return v != null ? String(v) : '';
  }

  async listTemplates(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, category, subject, body, variables
       FROM email_templates
       ORDER BY name ASC`,
    );
    return r.rows.map((row) => ({
      ...row,
      variables: Array.isArray(row.variables) ? row.variables : [],
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

  private mapCampaignRow(row: Record<string, unknown>): Record<string, unknown> {
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
