import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Injectable()
export class CommunicationWhatsappService {
  constructor(private readonly db: DatabaseService) {}

  private iso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') return v;
    return v != null ? String(v) : '';
  }

  async listQueue(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, "recipientName", "recipientPhone", message, category, status, "createdAt", metadata
       FROM whatsapp_task_queue
       ORDER BY "createdAt" DESC`,
    );
    return r.rows.map((row) => ({
      ...row,
      createdAt: this.iso(row.createdAt),
    }));
  }

  async addTask(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = String(body.id ?? '');
    if (!id) throw new Error('task id required');

    await this.db.query(
      `INSERT INTO whatsapp_task_queue (
        id, "recipientName", "recipientPhone", message, category, status, "createdAt", metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb)`,
      [
        id,
        String(body.recipientName ?? ''),
        String(body.recipientPhone ?? ''),
        String(body.message ?? ''),
        String(body.category ?? 'GENERAL'),
        String(body.status ?? 'PENDING'),
        this.iso(body.createdAt ?? new Date()),
        body.metadata ?? null,
      ],
    );

    const one = await this.db.query<Record<string, unknown>>(
      `SELECT id, "recipientName", "recipientPhone", message, category, status, "createdAt", metadata
       FROM whatsapp_task_queue WHERE id = $1`,
      [id],
    );
    const row = one.rows[0] ?? {};
    return { ...row, createdAt: this.iso(row.createdAt) };
  }

  async upsertTask(body: Record<string, unknown>): Promise<void> {
    const id = String(body.id ?? '');
    if (!id) throw new Error('task id required');

    await this.db.query(
      `INSERT INTO whatsapp_task_queue (
        id, "recipientName", "recipientPhone", message, category, status, "createdAt", metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        "recipientName" = EXCLUDED."recipientName",
        "recipientPhone" = EXCLUDED."recipientPhone",
        message = EXCLUDED.message,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata`,
      [
        id,
        String(body.recipientName ?? ''),
        String(body.recipientPhone ?? ''),
        String(body.message ?? ''),
        String(body.category ?? 'GENERAL'),
        String(body.status ?? 'PENDING'),
        this.iso(body.createdAt ?? new Date()),
        body.metadata ?? null,
      ],
    );
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.query(`DELETE FROM whatsapp_task_queue WHERE id = $1`, [id]);
  }

  async listTemplates(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, category, label, message, variables, "isDefault", "linkedTriggerId", "uiContext"
       FROM whatsapp_templates
       ORDER BY label ASC`,
    );
    return r.rows.map((row) => ({
      ...row,
      variables: Array.isArray(row.variables) ? row.variables : [],
      uiContext: Array.isArray(row.uiContext) ? row.uiContext : row.uiContext,
    }));
  }

  async upsertTemplate(body: Record<string, unknown>): Promise<void> {
    const id = String(body.id ?? '');
    if (!id) throw new Error('template id required');

    const vars = Array.isArray(body.variables) ? body.variables : [];
    const uiCtx = body.uiContext;
    const uiContextSql =
      uiCtx == null
        ? null
        : Array.isArray(uiCtx)
          ? uiCtx
          : typeof uiCtx === 'string'
            ? [uiCtx]
            : null;

    await this.db.query(
      `INSERT INTO whatsapp_templates (
        id, category, label, message, variables, "isDefault", "linkedTriggerId", "uiContext"
      ) VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8::text[])
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        label = EXCLUDED.label,
        message = EXCLUDED.message,
        variables = EXCLUDED.variables,
        "isDefault" = EXCLUDED."isDefault",
        "linkedTriggerId" = EXCLUDED."linkedTriggerId",
        "uiContext" = EXCLUDED."uiContext"`,
      [
        id,
        String(body.category ?? 'GENERAL'),
        String(body.label ?? ''),
        String(body.message ?? ''),
        vars.map(String),
        body.isDefault === true,
        body.linkedTriggerId != null && String(body.linkedTriggerId) !== ''
          ? String(body.linkedTriggerId)
          : null,
        uiContextSql,
      ],
    );
  }

  async resetTemplates(templates: Record<string, unknown>[]): Promise<void> {
    for (const t of templates) {
      await this.upsertTemplate(t);
    }
  }
}
