import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';

const SOURCE_CODE_REGEX = /^[a-z0-9_]{2,120}$/;

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function rowToCampaign(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    sourceCode: String(row.sourceCode),
    category: String(row.category),
    targetProductId: row.targetProductId
      ? String(row.targetProductId)
      : undefined,
    linkedDiscountCode: row.linkedDiscountCode
      ? String(row.linkedDiscountCode)
      : undefined,
    generatedLink: String(row.generatedLink),
    createdAt: toIso(row.createdAt),
    clicks: Number(row.clicks ?? 0),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
  };
}

@Injectable()
export class CampaignsService {
  constructor(private readonly db: DatabaseService) {}

  private normalizeSourceCode(input: unknown): string {
    const normalized = String(input ?? '').trim().toLowerCase();
    if (!SOURCE_CODE_REGEX.test(normalized)) {
      throw new BadRequestException(
        'sourceCode must be lowercase alphanumeric with underscore (2-120 chars)',
      );
    }
    return normalized;
  }

  async list(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, "sourceCode", category, "targetProductId", "linkedDiscountCode",
              "generatedLink", "createdAt", clicks, conversions, revenue
       FROM campaigns
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => rowToCampaign(r));
  }

  async create(body: Record<string, unknown>): Promise<unknown> {
    const id = typeof body.id === 'string' && body.id ? body.id : randomUUID();
    const name = String(body.name ?? '');
    const sourceCode = this.normalizeSourceCode(body.sourceCode);
    if (!name.trim() || !sourceCode.trim()) {
      throw new BadRequestException('name and sourceCode are required');
    }
    const category = String(body.category ?? 'OTHER');
    const generatedLink = String(body.generatedLink ?? '/');
    const createdAt = body.createdAt ? new Date(String(body.createdAt)) : new Date();

    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO campaigns (
        id, name, "sourceCode", category, "targetProductId", "linkedDiscountCode",
        "generatedLink", "createdAt", clicks, conversions, revenue
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, 0, 0, 0)
      RETURNING id, name, "sourceCode", category, "targetProductId", "linkedDiscountCode",
                "generatedLink", "createdAt", clicks, conversions, revenue`,
      [
        id,
        name,
        sourceCode,
        category,
        body.targetProductId ?? null,
        body.linkedDiscountCode ?? null,
        generatedLink,
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new BadRequestException('Insert failed');
    return rowToCampaign(row);
  }

  async update(id: string, body: Record<string, unknown>): Promise<unknown> {
    const existing = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, "sourceCode", category, "targetProductId", "linkedDiscountCode",
              "generatedLink", "createdAt", clicks, conversions, revenue
       FROM campaigns WHERE id = $1`,
      [id],
    );
    const row0 = existing.rows[0];
    if (!row0) throw new NotFoundException('Campaign not found');

    const name = body.name != null ? String(body.name) : String(row0.name);
    const sourceCode =
      body.sourceCode != null
        ? this.normalizeSourceCode(body.sourceCode)
        : String(row0.sourceCode);
    const category =
      body.category != null ? String(body.category) : String(row0.category);
    const generatedLink =
      body.generatedLink != null
        ? String(body.generatedLink)
        : String(row0.generatedLink);
    const targetProductId =
      body.targetProductId !== undefined
        ? body.targetProductId
        : row0.targetProductId;
    const linkedDiscountCode =
      body.linkedDiscountCode !== undefined
        ? body.linkedDiscountCode
        : row0.linkedDiscountCode;

    const result = await this.db.query<Record<string, unknown>>(
      `UPDATE campaigns SET
        name = $2,
        "sourceCode" = $3,
        category = $4,
        "targetProductId" = $5,
        "linkedDiscountCode" = $6,
        "generatedLink" = $7
       WHERE id = $1
       RETURNING id, name, "sourceCode", category, "targetProductId", "linkedDiscountCode",
                 "generatedLink", "createdAt", clicks, conversions, revenue`,
      [
        id,
        name,
        sourceCode,
        category,
        targetProductId ?? null,
        linkedDiscountCode ?? null,
        generatedLink,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Campaign not found');
    return rowToCampaign(row);
  }

  async trackClick(sourceCode: string): Promise<{ success: boolean }> {
    const normalizedSourceCode = this.normalizeSourceCode(sourceCode);
    const r = await this.db.query(
      `UPDATE campaigns SET clicks = clicks + 1 WHERE "sourceCode" = $1`,
      [normalizedSourceCode],
    );
    if (r.rowCount === 0) {
      throw new NotFoundException('Campaign source not found');
    }
    return { success: true };
  }

  async trackConversion(sourceCode: string, amount: number): Promise<{ success: boolean }> {
    const normalizedSourceCode = this.normalizeSourceCode(sourceCode);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount must be a non-negative number');
    }
    const r = await this.db.query(
      `UPDATE campaigns
       SET conversions = conversions + 1,
           revenue = revenue + $2
       WHERE "sourceCode" = $1`,
      [normalizedSourceCode, amount],
    );
    if (r.rowCount === 0) {
      throw new NotFoundException('Campaign source not found');
    }
    return { success: true };
  }

  async bulkUpsert(
    items: Record<string, unknown>[],
  ): Promise<{ inserted: number; updated: number; total: number }> {
    let inserted = 0;
    let updated = 0;

    for (const raw of items) {
      const sourceCode = String(raw.sourceCode ?? '').trim();
      if (!sourceCode) continue;

      const idHint =
        typeof raw.id === 'string' && raw.id.trim() ? String(raw.id) : null;

      let existingId: string | undefined;
      if (idHint) {
        const byId = await this.db.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE id = $1`,
          [idHint],
        );
        existingId = byId.rows[0]?.id;
      }
      if (!existingId) {
        const bySource = await this.db.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE "sourceCode" = $1`,
          [sourceCode],
        );
        existingId = bySource.rows[0]?.id;
      }

      if (existingId) {
        await this.update(existingId, raw);
        updated++;
      } else {
        await this.create(raw);
        inserted++;
      }
    }

    return { inserted, updated, total: items.length };
  }
}
