import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  BulkCampaignsDto,
  CreateCampaignDto,
  TrackClickDto,
  TrackConversionDto,
  UpdateCampaignDto,
} from './dto';

type CampaignRow = {
  id: string;
  name: string;
  sourceCode: string;
  category: string;
  targetProductId: string | null;
  linkedDiscountCode: string | null;
  generatedLink: string;
  createdAt: Date | string;
  clicks: number | string;
  conversions: number | string;
  revenue: number | string;
};

@Injectable()
export class CampaignsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const result = await this.db.query<CampaignRow>(
      `SELECT id, name, "sourceCode", category, "targetProductId",
              "linkedDiscountCode", "generatedLink", "createdAt",
              clicks, conversions, revenue
       FROM campaigns
       ORDER BY "createdAt" DESC, id DESC`,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findOne(id: string) {
    const row = await this.findById(id);
    if (!row) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    return this.mapRow(row);
  }

  async create(dto: CreateCampaignDto) {
    const payload = this.normalizeCreate(dto);

    try {
      await this.db.query(
        `INSERT INTO campaigns (
          id, name, "sourceCode", category, "targetProductId",
          "linkedDiscountCode", "generatedLink", "createdAt",
          clicks, conversions, revenue
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11)`,
        [
          payload.id,
          payload.name,
          payload.sourceCode,
          payload.category,
          payload.targetProductId,
          payload.linkedDiscountCode,
          payload.generatedLink,
          payload.createdAt,
          payload.clicks,
          payload.conversions,
          payload.revenue,
        ],
      );
    } catch (error) {
      this.rethrowDatabaseError(error, payload.sourceCode);
    }

    return this.findOne(payload.id);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const merged = this.normalizeUpdate(existing, dto);

    try {
      await this.db.query(
        `UPDATE campaigns
         SET name = $2,
             "sourceCode" = $3,
             category = $4,
             "targetProductId" = $5,
             "linkedDiscountCode" = $6,
             "generatedLink" = $7,
             clicks = $8,
             conversions = $9,
             revenue = $10
         WHERE id = $1`,
        [
          id,
          merged.name,
          merged.sourceCode,
          merged.category,
          merged.targetProductId,
          merged.linkedDiscountCode,
          merged.generatedLink,
          merged.clicks,
          merged.conversions,
          merged.revenue,
        ],
      );
    } catch (error) {
      this.rethrowDatabaseError(error, merged.sourceCode);
    }

    return this.findOne(id);
  }

  async trackClick(dto: TrackClickDto) {
    const result = await this.db.query(
      `UPDATE campaigns
       SET clicks = clicks + 1
       WHERE "sourceCode" = $1`,
      [dto.sourceCode],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(
        `Campaign with sourceCode ${dto.sourceCode} not found`,
      );
    }

    return { success: true };
  }

  async trackConversion(dto: TrackConversionDto) {
    const result = await this.db.query(
      `UPDATE campaigns
       SET conversions = conversions + 1,
           revenue = revenue + $2
       WHERE "sourceCode" = $1`,
      [dto.sourceCode, dto.amount],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(
        `Campaign with sourceCode ${dto.sourceCode} not found`,
      );
    }

    return { success: true };
  }

  async bulkUpsert(dto: BulkCampaignsDto) {
    let inserted = 0;
    let updated = 0;

    await this.db.withTransaction(async (client) => {
      for (const item of dto.items) {
        const existing = await this.findExistingForBulk(client, item);
        if (existing) {
          const merged = this.normalizeUpdate(existing, item);

          try {
            await client.query(
              `UPDATE campaigns
               SET name = $2,
                   "sourceCode" = $3,
                   category = $4,
                   "targetProductId" = $5,
                   "linkedDiscountCode" = $6,
                   "generatedLink" = $7,
                   clicks = $8,
                   conversions = $9,
                   revenue = $10
               WHERE id = $1`,
              [
                existing.id,
                merged.name,
                merged.sourceCode,
                merged.category,
                merged.targetProductId,
                merged.linkedDiscountCode,
                merged.generatedLink,
                merged.clicks,
                merged.conversions,
                merged.revenue,
              ],
            );
          } catch (error) {
            this.rethrowDatabaseError(error, merged.sourceCode);
          }

          updated += 1;
          continue;
        }

        const payload = this.normalizeCreate(item);
        try {
          await client.query(
            `INSERT INTO campaigns (
              id, name, "sourceCode", category, "targetProductId",
              "linkedDiscountCode", "generatedLink", "createdAt",
              clicks, conversions, revenue
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11)`,
            [
              payload.id,
              payload.name,
              payload.sourceCode,
              payload.category,
              payload.targetProductId,
              payload.linkedDiscountCode,
              payload.generatedLink,
              payload.createdAt,
              payload.clicks,
              payload.conversions,
              payload.revenue,
            ],
          );
        } catch (error) {
          this.rethrowDatabaseError(error, payload.sourceCode);
        }

        inserted += 1;
      }
    });

    return {
      inserted,
      updated,
      total: dto.items.length,
    };
  }

  private async findById(id: string): Promise<CampaignRow | undefined> {
    const result = await this.db.query<CampaignRow>(
      `SELECT id, name, "sourceCode", category, "targetProductId",
              "linkedDiscountCode", "generatedLink", "createdAt",
              clicks, conversions, revenue
       FROM campaigns
       WHERE id = $1`,
      [id],
    );
    return result.rows[0];
  }

  private async findExistingForBulk(
    client: PoolClient,
    item: Partial<CreateCampaignDto>,
  ): Promise<CampaignRow | undefined> {
    if (item.id) {
      const byId = await client.query<CampaignRow>(
        `SELECT id, name, "sourceCode", category, "targetProductId",
                "linkedDiscountCode", "generatedLink", "createdAt",
                clicks, conversions, revenue
         FROM campaigns
         WHERE id = $1`,
        [item.id],
      );
      if (byId.rows[0]) {
        return byId.rows[0];
      }
    }

    if (item.sourceCode) {
      const bySource = await client.query<CampaignRow>(
        `SELECT id, name, "sourceCode", category, "targetProductId",
                "linkedDiscountCode", "generatedLink", "createdAt",
                clicks, conversions, revenue
         FROM campaigns
         WHERE "sourceCode" = $1`,
        [item.sourceCode],
      );
      return bySource.rows[0];
    }

    return undefined;
  }

  private normalizeCreate(dto: Partial<CreateCampaignDto>) {
    const sourceCode = String(dto.sourceCode ?? '').trim();
    const targetProductId = this.normalizeNullable(dto.targetProductId);
    const linkedDiscountCode = this.normalizeNullable(dto.linkedDiscountCode);
    return {
      id: String(
        dto.id ?? `CMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ),
      name: String(dto.name ?? 'Untitled Campaign').trim(),
      sourceCode,
      category: String(dto.category ?? 'OTHER'),
      targetProductId,
      linkedDiscountCode,
      generatedLink:
        dto.generatedLink?.trim() ||
        this.buildGeneratedLink(
          sourceCode,
          targetProductId,
          linkedDiscountCode,
        ),
      createdAt: String(dto.createdAt ?? new Date().toISOString()),
      clicks: Number(dto.clicks ?? 0),
      conversions: Number(dto.conversions ?? 0),
      revenue: Number(dto.revenue ?? 0),
    };
  }

  private normalizeUpdate(
    existing: CampaignRow,
    dto: Partial<CreateCampaignDto> | UpdateCampaignDto,
  ) {
    const sourceCode = String(dto.sourceCode ?? existing.sourceCode).trim();
    const targetProductId =
      dto.targetProductId === undefined
        ? existing.targetProductId
        : this.normalizeNullable(dto.targetProductId);
    const linkedDiscountCode =
      dto.linkedDiscountCode === undefined
        ? existing.linkedDiscountCode
        : this.normalizeNullable(dto.linkedDiscountCode);

    return {
      name: String(dto.name ?? existing.name).trim(),
      sourceCode,
      category: String(dto.category ?? existing.category),
      targetProductId,
      linkedDiscountCode,
      generatedLink:
        dto.generatedLink?.trim() ||
        this.buildGeneratedLink(
          sourceCode,
          targetProductId,
          linkedDiscountCode,
        ),
      clicks:
        dto.clicks !== undefined ? Number(dto.clicks) : Number(existing.clicks),
      conversions:
        dto.conversions !== undefined
          ? Number(dto.conversions)
          : Number(existing.conversions),
      revenue:
        dto.revenue !== undefined
          ? Number(dto.revenue)
          : Number(existing.revenue),
    };
  }

  private buildGeneratedLink(
    sourceCode: string,
    targetProductId: string | null,
    linkedDiscountCode: string | null,
  ): string {
    const params = new URLSearchParams();
    params.set('view', 'store');
    if (targetProductId) {
      params.set('product', targetProductId);
    }
    params.set('source', sourceCode);
    if (linkedDiscountCode) {
      params.set('discount', linkedDiscountCode);
    }
    return `/?${params.toString()}`;
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  private mapRow(row: CampaignRow) {
    return {
      id: row.id,
      name: row.name,
      sourceCode: row.sourceCode,
      category: row.category,
      targetProductId: row.targetProductId ?? undefined,
      linkedDiscountCode: row.linkedDiscountCode ?? undefined,
      generatedLink: row.generatedLink,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      clicks: Number(row.clicks ?? 0),
      conversions: Number(row.conversions ?? 0),
      revenue: Number(row.revenue ?? 0),
    };
  }

  private rethrowDatabaseError(error: unknown, sourceCode: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException(
        `Campaign with sourceCode ${sourceCode} already exists`,
      );
    }

    throw error;
  }
}
