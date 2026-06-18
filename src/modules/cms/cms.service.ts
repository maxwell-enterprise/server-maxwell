import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/app-config.service';

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

function nullableTimestamp(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return toIso(v);
}

const CMS_AI_FEATURE_NAME = 'CMS_CONTENT_EDITOR';
const CMS_AI_UNAVAILABLE_MESSAGE =
  'AI content generation is temporarily unavailable.';
const USD_TO_IDR_RATE = 16_300;
const MODEL_PRICING_USD_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  default: { input: 1.0, output: 2.0 },
};

type CmsAiGenerateResult = {
  title: string;
  body: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

@Injectable()
export class CmsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
  ) {}

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
        nullableTimestamp(body.publishDate) ?? new Date().toISOString(),
        nullableTimestamp(body.unpublishDate),
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
    const publishDate =
      body.publishDate !== undefined
        ? nullableTimestamp(body.publishDate) ?? toIso(row0.publishDate)
        : toIso(row0.publishDate);
    const unpublishDate =
      body.unpublishDate !== undefined
        ? nullableTimestamp(body.unpublishDate)
        : nullableTimestamp(row0.unpublishDate);
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

  /**
   * Public landing / portal analytics — no auth. Only increments for live PUBLISHED posts.
   */
  async incrementPublicStat(
    id: string,
    field: 'views' | 'shares' | 'clicks',
  ): Promise<{ ok: true }> {
    const existing = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM cms_content WHERE id = $1::uuid`,
      [id],
    );
    const row0 = existing.rows[0];
    if (!row0) throw new NotFoundException('Content not found');

    const post = this.rowToPost(row0);
    if (post.status !== 'PUBLISHED') {
      return { ok: true };
    }
    const now = new Date();
    const started = new Date(post.publishDate) <= now;
    const ended = post.unpublishDate
      ? new Date(post.unpublishDate) > now
      : true;
    if (!started || !ended) {
      return { ok: true };
    }

    const nextStats = {
      ...post.stats,
      [field]: Number(post.stats[field] ?? 0) + 1,
    };

    await this.db.query(
      `UPDATE cms_content SET stats = $2::jsonb WHERE id = $1::uuid`,
      [id, JSON.stringify(nextStats)],
    );
    return { ok: true };
  }

  async generateAiContent(
    body: Record<string, unknown>,
    actorUserId: string,
  ): Promise<{ title: string; body: string }> {
    const apiKey = this.config.geminiApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Gemini API key is not configured on the server.',
      );
    }

    const prompt = this.buildCmsPrompt(body);
    const result = await this.generateWithGemini(prompt, apiKey);
    await this.logAiUsage(actorUserId, prompt, result);

    return {
      title: result.title,
      body: result.body,
    };
  }

  private buildCmsPrompt(body: Record<string, unknown>): string {
    const contentType = String(body.contentType ?? 'ARTICLE').trim();
    const userPrompt = String(body.prompt ?? '').trim();
    const existingTitle = String(body.existingTitle ?? '').trim();
    const existingBody = String(body.existingBody ?? '').trim();
    const ctaLabel = String(body.ctaLabel ?? '').trim();
    const linkedProduct =
      body.linkedProduct && typeof body.linkedProduct === 'object'
        ? (body.linkedProduct as Record<string, unknown>)
        : null;

    const productSummary = linkedProduct
      ? JSON.stringify(
          {
            id: linkedProduct.id ?? '',
            title: linkedProduct.title ?? '',
            category: linkedProduct.category ?? '',
            priceIdr: linkedProduct.priceIdr ?? '',
            description: linkedProduct.description ?? '',
          },
          null,
          2,
        )
      : 'No linked product.';

    return [
      'You are an AI content assistant for Maxwell Leadership Indonesia.',
      'Return output as strict JSON with exactly two keys: "title" and "body".',
      'Use Bahasa Indonesia that is professional, persuasive, and clean.',
      'Do not invent prices, schedules, batch dates, quotas, refunds, or registration links.',
      'If there is a linked product, align the copy to that product context.',
      'For ARTICLE or NEWS, create educational/editorial copy.',
      'For ADVERTISEMENT, create conversion-oriented copy with a clear CTA.',
      '',
      `Content type: ${contentType}`,
      `User request: ${userPrompt}`,
      `Existing title: ${existingTitle || '-'}`,
      `Existing body: ${existingBody || '-'}`,
      `CTA label: ${ctaLabel || '-'}`,
      'Linked product context:',
      productSummary,
    ].join('\n');
  }

  private async generateWithGemini(
    prompt: string,
    apiKey: string,
  ): Promise<CmsAiGenerateResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          this.config.geminiModel,
        )}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.6,
              topP: 0.9,
              maxOutputTokens: 900,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(CMS_AI_UNAVAILABLE_MESSAGE);
      }

      const data = (await response.json()) as GeminiGenerateResponse;
      const raw =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? '';
      if (!raw) {
        throw new ServiceUnavailableException(CMS_AI_UNAVAILABLE_MESSAGE);
      }

      let parsed: { title?: unknown; body?: unknown } = {};
      try {
        parsed = JSON.parse(raw) as { title?: unknown; body?: unknown };
      } catch {
        parsed = {};
      }

      const title = String(parsed.title ?? '').trim();
      const body = String(parsed.body ?? '').trim();
      if (!title || !body) {
        throw new ServiceUnavailableException(CMS_AI_UNAVAILABLE_MESSAGE);
      }

      const promptTokens =
        Number(data.usageMetadata?.promptTokenCount ?? 0) ||
        this.estimateTokens(prompt);
      const completionTokens =
        Number(data.usageMetadata?.candidatesTokenCount ?? 0) ||
        this.estimateTokens(raw);
      const totalTokens =
        Number(data.usageMetadata?.totalTokenCount ?? 0) ||
        promptTokens + completionTokens;

      return {
        title,
        body,
        promptTokens,
        completionTokens,
        totalTokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  private async logAiUsage(
    actorUserId: string,
    prompt: string,
    result: CmsAiGenerateResult,
  ): Promise<void> {
    const pricing =
      MODEL_PRICING_USD_PER_1M_TOKENS[this.config.geminiModel] ??
      MODEL_PRICING_USD_PER_1M_TOKENS.default;
    const inputCost = (result.promptTokens / 1_000_000) * pricing.input;
    const outputCost =
      (result.completionTokens / 1_000_000) * pricing.output;
    const costUSD = inputCost + outputCost;
    const costIDR = costUSD * USD_TO_IDR_RATE;

    await this.db.query(
      `INSERT INTO ai_usage_logs (
        id,
        timestamp,
        "userId",
        "featureName",
        model,
        prompt,
        response,
        "promptTokens",
        "completionTokens",
        "totalTokens",
        "costUSD",
        "costIDR"
      ) VALUES (
        gen_random_uuid(),
        now(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      )`,
      [
        actorUserId,
        CMS_AI_FEATURE_NAME,
        this.config.geminiModel,
        prompt.slice(0, 12_000),
        JSON.stringify({
          title: result.title,
          body: result.body,
        }).slice(0, 8_000),
        result.promptTokens,
        result.completionTokens,
        result.totalTokens,
        costUSD,
        costIDR,
      ],
    );
  }
}
