import {
  Injectable,
  Logger,
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
const CMS_AI_TIMEOUT_MS = 45_000;
const CMS_AI_MAX_OUTPUT_TOKENS = 2048;
const CMS_PROMPT_BODY_MAX_CHARS = 1_500;
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

function stripHtmlAndTruncate(html: string, maxLen: number): string {
  const plain = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) {
    return plain;
  }
  return `${plain.slice(0, maxLen)}…`;
}
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

const CMS_POST_RETURNING = `
  id, title, slug, body, "imageUrl", type, status,
  "publishDate", "unpublishDate", "linkedProductId", "ctaLabel",
  author, tags, stats,
  (
    SELECT p.public_id
    FROM products p
    WHERE p.id = cms_content."linkedProductId"
    LIMIT 1
  ) AS "linkedProductPublicId"
`;

const CMS_LIST_SELECT = `
  SELECT
    c.id, c.title, c.slug, c.body, c."imageUrl", c.type, c.status,
    c."publishDate", c."unpublishDate", c."linkedProductId", c."ctaLabel",
    c.author, c.tags, c.stats,
    p.public_id AS "linkedProductPublicId"
  FROM cms_content c
  LEFT JOIN products p ON p.id = c."linkedProductId"
`;

@Injectable()
export class CmsService {
  private readonly logger = new Logger(CmsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
  ) {}

  /** FE catalog uses product `public_id`; DB FK stores internal UUID. */
  private async resolveLinkedProductUuid(
    productRef: unknown,
  ): Promise<string | null> {
    if (productRef == null) {
      return null;
    }
    const raw = String(productRef).trim();
    if (!raw) {
      return null;
    }

    if (UUID_RE.test(raw)) {
      const byUuid = await this.db.query<{ id: string }>(
        `SELECT id::text AS id FROM products WHERE id = $1::uuid LIMIT 1`,
        [raw],
      );
      return byUuid.rows[0]?.id ?? null;
    }

    const byPublicId = await this.db.query<{ id: string }>(
      `SELECT id::text AS id FROM products WHERE public_id = $1 LIMIT 1`,
      [raw],
    );
    return byPublicId.rows[0]?.id ?? null;
  }

  private rowToPost(row: Record<string, unknown>) {
    const stats = parseJson<Record<string, unknown>>(row.stats, {});
    const linkedPublicId =
      row.linkedProductPublicId != null &&
      String(row.linkedProductPublicId).trim() !== ''
        ? String(row.linkedProductPublicId)
        : undefined;
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
      linkedProductId:
        linkedPublicId ??
        (row.linkedProductId ? String(row.linkedProductId) : undefined),
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
      `${CMS_LIST_SELECT}
       ORDER BY c."publishDate" DESC NULLS LAST`,
    );
    return result.rows.map((r) => this.rowToPost(r));
  }

  /** Public article page — published post by slug, within schedule window. */
  async getPublishedBySlug(slug: string): Promise<unknown> {
    const normalized = String(slug ?? '').trim();
    if (!normalized) {
      throw new NotFoundException('Content not found');
    }

    const result = await this.db.query<Record<string, unknown>>(
      `${CMS_LIST_SELECT}
       WHERE c.slug = $1
       LIMIT 1`,
      [normalized],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Content not found');
    }

    const post = this.rowToPost(row);
    const now = new Date();
    const isPublished = post.status === 'PUBLISHED';
    const started = new Date(post.publishDate) <= now;
    const ended = post.unpublishDate
      ? new Date(post.unpublishDate) > now
      : true;
    if (!isPublished || !started || !ended) {
      throw new NotFoundException('Content not found');
    }

    return post;
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

    const rawSlug = String(body.slug ?? '').trim();
    const slug = await this.resolveUniqueSlug(
      rawSlug ||
        this.slugFromTitle(String(body.title ?? '')) ||
        `post-${Date.now()}`,
    );
    const linkedProductId = await this.resolveLinkedProductUuid(
      body.linkedProductId,
    );

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
      RETURNING ${CMS_POST_RETURNING}`,
      [
        String(body.title ?? ''),
        slug,
        String(body.body ?? ''),
        body.imageUrl ?? null,
        String(body.type ?? 'ARTICLE'),
        String(body.status ?? 'DRAFT'),
        nullableTimestamp(body.publishDate) ?? new Date().toISOString(),
        nullableTimestamp(body.unpublishDate),
        linkedProductId,
        body.ctaLabel != null && String(body.ctaLabel).trim() !== ''
          ? String(body.ctaLabel).trim()
          : null,
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
    const requestedSlug =
      body.slug != null ? String(body.slug).trim() : String(row0.slug);
    const slug =
      requestedSlug !== String(row0.slug)
        ? await this.resolveUniqueSlug(
            requestedSlug || this.slugFromTitle(title) || String(row0.slug),
            id,
          )
        : String(row0.slug);
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
        ? await this.resolveLinkedProductUuid(body.linkedProductId)
        : uuidOrNull(row0.linkedProductId);
    const ctaLabel =
      body.ctaLabel !== undefined
        ? body.ctaLabel != null && String(body.ctaLabel).trim() !== ''
          ? String(body.ctaLabel).trim()
          : null
        : row0.ctaLabel;
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
       RETURNING ${CMS_POST_RETURNING}`,
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
    try {
      await this.logAiUsage(actorUserId, prompt, result);
    } catch (error) {
      this.logger.warn(
        `CMS AI usage log failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      title: result.title,
      body: result.body,
    };
  }

  private buildCmsPrompt(body: Record<string, unknown>): string {
    const contentType = String(body.contentType ?? 'ARTICLE').trim();
    const userPrompt = String(body.prompt ?? '').trim();
    const existingTitle = String(body.existingTitle ?? '').trim();
    const existingBody = stripHtmlAndTruncate(
      String(body.existingBody ?? '').trim(),
      CMS_PROMPT_BODY_MAX_CHARS,
    );
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

  private slugFromTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug;
  }

  private async resolveUniqueSlug(
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    const normalized = baseSlug.trim() || `post-${Date.now()}`;
    let candidate = normalized;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = excludeId
        ? await this.db.query<{ id: string }>(
            `SELECT id FROM cms_content WHERE slug = $1 AND id != $2::uuid LIMIT 1`,
            [candidate, excludeId],
          )
        : await this.db.query<{ id: string }>(
            `SELECT id FROM cms_content WHERE slug = $1 LIMIT 1`,
            [candidate],
          );
      if (result.rows.length === 0) {
        return candidate;
      }
      candidate = `${normalized}-${attempt + 2}`;
    }
    return `${normalized}-${Date.now()}`;
  }

  private async generateWithGemini(
    prompt: string,
    apiKey: string,
  ): Promise<CmsAiGenerateResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CMS_AI_TIMEOUT_MS);

    try {
      const model = this.config.geminiModel;
      const response = await fetch(
        `${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent`,
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
              maxOutputTokens: CMS_AI_MAX_OUTPUT_TOKENS,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        this.logger.error(
          `CMS Gemini request failed ${response.status}: ${detail.slice(0, 500)}`,
        );
        throw new ServiceUnavailableException(CMS_AI_UNAVAILABLE_MESSAGE);
      }

      const data = (await response.json()) as GeminiGenerateResponse;
      const raw =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? '';
      if (!raw) {
        this.logger.warn('CMS Gemini returned empty candidate content.');
        throw new ServiceUnavailableException(CMS_AI_UNAVAILABLE_MESSAGE);
      }

      let parsed: { title?: unknown; body?: unknown } = {};
      try {
        parsed = JSON.parse(raw) as { title?: unknown; body?: unknown };
      } catch (error) {
        this.logger.warn(
          `CMS Gemini JSON parse failed: ${
            error instanceof Error ? error.message : String(error)
          }; raw=${raw.slice(0, 200)}`,
        );
        parsed = {};
      }

      const title = String(parsed.title ?? '').trim();
      const body = String(parsed.body ?? '').trim();
      if (!title || !body) {
        this.logger.warn(
          `CMS Gemini response missing title/body. raw=${raw.slice(0, 200)}`,
        );
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
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : String(error);
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || message.includes('aborted'));
      this.logger.error(
        isTimeout
          ? `CMS Gemini request timed out after ${CMS_AI_TIMEOUT_MS}ms`
          : `CMS Gemini request failed: ${message}`,
      );
      throw new ServiceUnavailableException(
        isTimeout
          ? 'AI content generation timed out. Try a shorter prompt or try again.'
          : CMS_AI_UNAVAILABLE_MESSAGE,
      );
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
