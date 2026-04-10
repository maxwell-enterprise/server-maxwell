import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v);
  return UUID_RE.test(s) ? s : null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

@Injectable()
export class CmsService {
  constructor(private readonly db: DatabaseService) {}

  private rowToPost(row: Record<string, unknown>) {
    const stats = parseJson<Record<string, unknown>>(row.stats, {});
    return {
      id: String(row.id),
      title: String(row.title),
      slug: String(row.slug),
      body: String(row.body),
      imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
      type: String(row.type),
      status: String(row.status),
      publishDate: toIso(row.publishDate),
      unpublishDate: row.unpublishDate ? toIso(row.unpublishDate) : undefined,
      linkedProductId: row.linkedProductId
        ? String(row.linkedProductId)
        : undefined,
      ctaLabel: row.ctaLabel ? String(row.ctaLabel) : undefined,
      author: String(row.author),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      stats: {
        views: Number(stats.views ?? 0),
        shares: Number(stats.shares ?? 0),
        clicks: Number(stats.clicks ?? 0),
        conversions: Number(stats.conversions ?? 0),
        revenueAttributed: Number(stats.revenueAttributed ?? 0),
      },
    };
  }

  async list(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, title, slug, body, "imageUrl", type, status,
              "publishDate", "unpublishDate", "linkedProductId", "ctaLabel",
              author, tags, stats
       FROM cms_content
       ORDER BY "publishDate" DESC NULLS LAST`,
    );
    return result.rows.map((r) => this.rowToPost(r));
  }

  async create(body: Record<string, unknown>): Promise<unknown> {
    const defaultStats = {
      views: 0,
      shares: 0,
      clicks: 0,
      conversions: 0,
      revenueAttributed: 0,
    };
    const statsPayload =
      typeof body.stats === 'object' && body.stats !== null
        ? { ...defaultStats, ...body.stats }
        : defaultStats;

    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO cms_content (
        title, slug, body, "imageUrl", type, status,
        "publishDate", "unpublishDate", "linkedProductId", "ctaLabel",
        author, tags, stats
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::timestamptz, $8::timestamptz, $9::uuid, $10,
        $11, $12::text[], $13::jsonb
      )
      RETURNING id, title, slug, body, "imageUrl", type, status,
                "publishDate", "unpublishDate", "linkedProductId", "ctaLabel",
                author, tags, stats`,
      [
        String(body.title ?? ''),
        String(body.slug ?? ''),
        String(body.body ?? ''),
        body.imageUrl ?? null,
        String(body.type ?? 'ARTICLE'),
        String(body.status ?? 'DRAFT'),
        body.publishDate ?? new Date().toISOString(),
        body.unpublishDate ?? null,
        uuidOrNull(body.linkedProductId),
        body.ctaLabel ?? null,
        String(body.author ?? ''),
        Array.isArray(body.tags) ? body.tags : [],
        JSON.stringify(statsPayload),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Insert failed');
    return this.rowToPost(row);
  }

  async update(id: string, body: Record<string, unknown>): Promise<unknown> {
    const existing = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM cms_content WHERE id = $1::uuid`,
      [id],
    );
    const row0 = existing.rows[0];
    if (!row0) throw new NotFoundException('Content not found');

    const prevStats = parseJson<Record<string, unknown>>(row0.stats, {});
    const nextStats =
      typeof body.stats === 'object' && body.stats !== null
        ? { ...prevStats, ...body.stats }
        : prevStats;

    const title = body.title != null ? String(body.title) : String(row0.title);
    const slug = body.slug != null ? String(body.slug) : String(row0.slug);
    const b = body.body != null ? String(body.body) : String(row0.body);
    const imageUrl =
      body.imageUrl !== undefined ? body.imageUrl : row0.imageUrl;
    const type = body.type != null ? String(body.type) : String(row0.type);
    const status =
      body.status != null ? String(body.status) : String(row0.status);
    const publishDate = body.publishDate ?? row0.publishDate;
    const unpublishDate =
      body.unpublishDate !== undefined
        ? body.unpublishDate
        : row0.unpublishDate;
    const linkedProductId =
      body.linkedProductId !== undefined
        ? uuidOrNull(body.linkedProductId)
        : uuidOrNull(row0.linkedProductId);
    const ctaLabel =
      body.ctaLabel !== undefined ? body.ctaLabel : row0.ctaLabel;
    const author =
      body.author != null ? String(body.author) : String(row0.author);
    const tags = Array.isArray(body.tags) ? body.tags : row0.tags;

    const result = await this.db.query<Record<string, unknown>>(
      `UPDATE cms_content SET
        title = $2,
        slug = $3,
        body = $4,
        "imageUrl" = $5,
        type = $6,
        status = $7,
        "publishDate" = $8::timestamptz,
        "unpublishDate" = $9::timestamptz,
        "linkedProductId" = $10::uuid,
        "ctaLabel" = $11,
        author = $12,
        tags = $13::text[],
        stats = $14::jsonb
       WHERE id = $1::uuid
       RETURNING id, title, slug, body, "imageUrl", type, status,
                 "publishDate", "unpublishDate", "linkedProductId", "ctaLabel",
                 author, tags, stats`,
      [
        id,
        title,
        slug,
        b,
        imageUrl,
        type,
        status,
        publishDate,
        unpublishDate,
        linkedProductId,
        ctaLabel,
        author,
        Array.isArray(tags) ? tags : [],
        JSON.stringify(nextStats),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Content not found');
    return this.rowToPost(row);
  }

  async remove(id: string): Promise<void> {
    const r = await this.db.query(
      `DELETE FROM cms_content WHERE id = $1::uuid`,
      [id],
    );
    if (r.rowCount === 0) throw new NotFoundException('Content not found');
  }
}
