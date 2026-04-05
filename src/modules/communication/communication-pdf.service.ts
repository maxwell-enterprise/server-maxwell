import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Injectable()
export class CommunicationPdfService {
  constructor(private readonly db: DatabaseService) {}

  private iso(v: unknown): string | undefined {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' && v.length > 0) return v;
    return undefined;
  }

  async listTemplates(): Promise<Record<string, unknown>[]> {
    const r = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, category, orientation, pages, "createdAt"
       FROM sys_pdf_templates
       ORDER BY name ASC`,
    );
    return r.rows.map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      category: String(row.category ?? ''),
      orientation: String(row.orientation ?? 'PORTRAIT'),
      pages: Array.isArray(row.pages) ? row.pages : row.pages ?? [],
      createdAt: this.iso(row.createdAt),
    }));
  }

  async upsertTemplate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let id = body.id != null ? String(body.id) : '';
    if (!id) id = `PDF-${Date.now()}`;

    const pages = body.pages ?? [];
    await this.db.query(
      `INSERT INTO sys_pdf_templates (id, name, category, orientation, pages)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         orientation = EXCLUDED.orientation,
         pages = EXCLUDED.pages`,
      [
        id,
        String(body.name ?? ''),
        String(body.category ?? 'CERTIFICATE'),
        String(body.orientation ?? 'PORTRAIT'),
        pages,
      ],
    );

    const one = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, category, orientation, pages, "createdAt"
       FROM sys_pdf_templates WHERE id = $1`,
      [id],
    );
    const row = one.rows[0] ?? {};
    return {
      id: String(row.id ?? id),
      name: String(row.name ?? ''),
      category: String(row.category ?? ''),
      orientation: String(row.orientation ?? 'PORTRAIT'),
      pages: Array.isArray(row.pages) ? row.pages : [],
      createdAt: this.iso(row.createdAt),
    };
  }
}
