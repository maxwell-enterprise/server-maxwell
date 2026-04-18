import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { DbService } from '../../common/db.service';
import {
  assertServiceRoleKeyLooksLikeJwt,
  explainSupabaseJwsError,
  normalizeSupabaseJwtKey,
  normalizeSupabaseUrl,
} from '../../common/supabase-service-env';
import {
  CreateProductDto,
  ProductQueryDto,
  ProductVariantDto,
  UpdateProductDto,
} from './dto';
import {
  InstallmentConfig,
  Product,
  ProductItem,
  ProductVariant,
} from './entities';

interface ProductRow {
  internalId: string;
  id: string;
  title: string;
  description: string | null;
  priceIdr: string | number;
  compareAtPriceIdr: string | number | null;
  category: Product['category'];
  imageUrl: string | null;
  items: ProductItem[] | null;
  hasVariants: boolean;
  variants: ProductVariant[] | null;
  installmentConfig: InstallmentConfig | null;
  isActive: boolean;
}

type UploadedImageFile = {
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Some browsers / OS send non-standard MIME labels. */
const IMAGE_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

function sniffImageMime(buffer: Buffer): string | null {
  if (!buffer?.length || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.toString('utf8', 0, 4) === 'RIFF' &&
    buffer.toString('utf8', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  const sig6 = buffer.toString('ascii', 0, 6);
  if (sig6 === 'GIF87a' || sig6 === 'GIF89a') {
    return 'image/gif';
  }
  return null;
}

/** Resolve effective MIME when client sends wrong/empty `Content-Type` for multipart. */
function resolveProductUploadMime(
  declared: string | undefined,
  buffer: Buffer,
): string | null {
  const raw = (declared ?? '').trim().toLowerCase();
  const aliased = raw ? (IMAGE_MIME_ALIASES[raw] ?? raw) : '';
  if (aliased && ALLOWED_IMAGE_MIMES.has(aliased)) {
    return aliased;
  }
  return sniffImageMime(buffer);
}

@Injectable()
export class ProductsService {
  constructor(private readonly db: DbService) {}

  async uploadImage(
    file: UploadedImageFile,
  ): Promise<{ url: string; path: string }> {
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('Image size exceeds 2MB limit');
    }

    const mime = resolveProductUploadMime(file.mimetype, file.buffer);
    if (!mime) {
      throw new BadRequestException(
        'Only JPG, PNG, WEBP, or GIF images are allowed (file type could not be detected — try exporting as JPEG or PNG).',
      );
    }

    const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
    const serviceRoleKey = normalizeSupabaseJwtKey(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    );
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'app-images';
    if (!supabaseUrl || !serviceRoleKey) {
      throw new BadRequestException(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server-maxwell/.env (see .env.example).',
      );
    }

    assertServiceRoleKeyLooksLikeJwt(serviceRoleKey);

    const ext =
      mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : 'jpg';
    const objectPath = `products/${Date.now()}-${randomUUID()}.${ext}`;

    let supabase: ReturnType<typeof createClient>;
    try {
      // Always send the service_role key for Storage requests. Without this, supabase-js
      // may use `auth.getSession()` first; a stray/empty session access_token yields
      // `Authorization: Bearer ` with garbage and Supabase returns "Invalid Compact JWS".
      supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => serviceRoleKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Supabase client init failed: ${explainSupabaseJwsError(msg)}`,
      );
    }

    let uploadError: { message: string } | null = null;
    try {
      const out = await supabase.storage
        .from(bucket)
        .upload(objectPath, file.buffer, { contentType: mime, upsert: false });
      uploadError = out.error;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Storage upload failed: ${explainSupabaseJwsError(msg)}`,
      );
    }
    if (uploadError) {
      throw new BadRequestException(
        `Storage upload failed: ${explainSupabaseJwsError(uploadError.message)}`,
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return { url: data.publicUrl, path: objectPath };
  }

  async create(dto: CreateProductDto): Promise<Product> {
    this.assertBusinessRules(dto);

    const publicId = await this.resolvePublicId(dto.id, dto.title);

    const result = await this.db.query<ProductRow>(
      `
      insert into products (
        public_id,
        title,
        description,
        "priceIdr",
        "compareAtPriceIdr",
        category,
        "imageUrl",
        items,
        "hasVariants",
        variants,
        "installmentConfig",
        "isActive",
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        $10::jsonb,
        $11::jsonb,
        $12,
        now(),
        now()
      )
      returning
        id::text as "internalId",
        public_id as id,
        title,
        description,
        "priceIdr" as "priceIdr",
        "compareAtPriceIdr" as "compareAtPriceIdr",
        category,
        "imageUrl" as "imageUrl",
        items,
        "hasVariants" as "hasVariants",
        variants,
        "installmentConfig" as "installmentConfig",
        "isActive" as "isActive"
      `,
      [
        publicId,
        dto.title.trim(),
        dto.description?.trim() || null,
        dto.priceIdr,
        dto.compareAtPriceIdr ?? null,
        dto.category,
        dto.imageUrl?.trim() || null,
        JSON.stringify(dto.items),
        dto.hasVariants,
        JSON.stringify(dto.variants ?? []),
        dto.installmentConfig ? JSON.stringify(dto.installmentConfig) : null,
        dto.isActive,
      ],
    );

    return this.toProduct(result.rows[0]);
  }

  async findAll(
    query: ProductQueryDto,
  ): Promise<{ data: Product[]; total: number }> {
    const params: Array<string | boolean> = [];
    const where: string[] = [];

    if (query.search) {
      params.push(`%${query.search.trim()}%`);
      where.push(
        `(p.title ilike $${params.length} or coalesce(p.description, '') ilike $${params.length})`,
      );
    }

    if (query.category) {
      params.push(query.category);
      where.push(`p.category = $${params.length}`);
    }

    if (typeof query.isActive === 'boolean') {
      params.push(query.isActive);
      where.push(`p."isActive" = $${params.length}`);
    }

    if (typeof query.hasVariants === 'boolean') {
      params.push(query.hasVariants);
      where.push(`p."hasVariants" = $${params.length}`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const sortColumns: Record<ProductQueryDto['sortBy'], string> = {
      title: 'p.title',
      priceIdr: 'p."priceIdr"',
      category: 'p.category',
      createdAt: 'p.created_at',
    };
    const sortBy = sortColumns[query.sortBy];
    const sortOrder = query.sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const baseSql = `
      select
        p.id::text as "internalId",
        p.public_id as id,
        p.title,
        p.description,
        p."priceIdr" as "priceIdr",
        p."compareAtPriceIdr" as "compareAtPriceIdr",
        p.category,
        p."imageUrl" as "imageUrl",
        p.items,
        p."hasVariants" as "hasVariants",
        p.variants,
        p."installmentConfig" as "installmentConfig",
        p."isActive" as "isActive"
      from products p
      ${whereSql}
      order by ${sortBy} ${sortOrder}, p.created_at desc
    `;

    // `limit` is optional: when omitted, return the full sorted list.
    if (typeof query.limit !== 'number') {
      const fullResult = await this.db.query<ProductRow>(baseSql, params);
      const data = fullResult.rows.map((row) => this.toProduct(row));

      return {
        data,
        total: data.length,
      };
    }

    const { rows, total } = await this.db.paginatedQuery<ProductRow>(
      baseSql,
      params,
      query.page ?? 1,
      query.limit,
    );

    return {
      data: rows.map((row) => this.toProduct(row)),
      total,
    };
  }

  async findOne(identifier: string): Promise<Product> {
    const row = await this.findRowByIdentifier(identifier);
    return this.toProduct(row);
  }

  async update(identifier: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.findRowByIdentifier(identifier);
    const merged = this.mergeExistingWithUpdate(existing, dto);
    this.assertBusinessRules(merged);

    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.title !== undefined) {
      params.push(dto.title.trim());
      fields.push(`title = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description?.trim() || null);
      fields.push(`description = $${params.length}`);
    }
    if (dto.priceIdr !== undefined) {
      params.push(dto.priceIdr);
      fields.push(`"priceIdr" = $${params.length}`);
    }
    if (dto.compareAtPriceIdr !== undefined) {
      params.push(dto.compareAtPriceIdr ?? null);
      fields.push(`"compareAtPriceIdr" = $${params.length}`);
    }
    if (dto.category !== undefined) {
      params.push(dto.category);
      fields.push(`category = $${params.length}`);
    }
    if (dto.imageUrl !== undefined) {
      params.push(dto.imageUrl?.trim() || null);
      fields.push(`"imageUrl" = $${params.length}`);
    }
    if (dto.items !== undefined) {
      params.push(JSON.stringify(dto.items));
      fields.push(`items = $${params.length}::jsonb`);
    }
    if (dto.hasVariants !== undefined) {
      params.push(dto.hasVariants);
      fields.push(`"hasVariants" = $${params.length}`);
    }
    if (dto.variants !== undefined) {
      params.push(JSON.stringify(dto.variants ?? []));
      fields.push(`variants = $${params.length}::jsonb`);
    }
    if (dto.installmentConfig !== undefined) {
      params.push(
        dto.installmentConfig ? JSON.stringify(dto.installmentConfig) : null,
      );
      fields.push(`"installmentConfig" = $${params.length}::jsonb`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      fields.push(`"isActive" = $${params.length}`);
    }

    if (!fields.length) {
      return this.toProduct(existing);
    }

    params.push(existing.internalId);

    const result = await this.db.query<ProductRow>(
      `
      update products
      set ${fields.join(', ')}, updated_at = now()
      where id = $${params.length}::uuid
      returning
        id::text as "internalId",
        public_id as id,
        title,
        description,
        "priceIdr" as "priceIdr",
        "compareAtPriceIdr" as "compareAtPriceIdr",
        category,
        "imageUrl" as "imageUrl",
        items,
        "hasVariants" as "hasVariants",
        variants,
        "installmentConfig" as "installmentConfig",
        "isActive" as "isActive"
      `,
      params,
    );

    return this.toProduct(result.rows[0]);
  }

  async remove(identifier: string): Promise<void> {
    const existing = await this.findRowByIdentifier(identifier);
    await this.db.query('delete from products where id = $1::uuid', [
      existing.internalId,
    ]);
  }

  private async findRowByIdentifier(identifier: string): Promise<ProductRow> {
    const result = await this.db.query<ProductRow>(
      `
      select
        p.id::text as "internalId",
        p.public_id as id,
        p.title,
        p.description,
        p."priceIdr" as "priceIdr",
        p."compareAtPriceIdr" as "compareAtPriceIdr",
        p.category,
        p."imageUrl" as "imageUrl",
        p.items,
        p."hasVariants" as "hasVariants",
        p.variants,
        p."installmentConfig" as "installmentConfig",
        p."isActive" as "isActive"
      from products p
      where p.public_id = $1 or p.id::text = $1
      limit 1
      `,
      [identifier],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Product ${identifier} not found`);
    }

    return row;
  }

  private toProduct(row: ProductRow): Product {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      priceIdr: Number(row.priceIdr),
      compareAtPriceIdr:
        row.compareAtPriceIdr === null
          ? undefined
          : Number(row.compareAtPriceIdr),
      category: row.category,
      imageUrl: row.imageUrl ?? '',
      items: Array.isArray(row.items) ? row.items : [],
      hasVariants: row.hasVariants,
      variants:
        Array.isArray(row.variants) && row.variants.length > 0
          ? row.variants
          : undefined,
      installmentConfig: row.installmentConfig ?? undefined,
      isActive: row.isActive,
    };
  }

  private mergeExistingWithUpdate(
    existing: ProductRow,
    update: UpdateProductDto,
  ): CreateProductDto {
    return {
      id: existing.id,
      title: update.title ?? existing.title,
      description:
        update.description !== undefined
          ? (update.description ?? '')
          : (existing.description ?? ''),
      priceIdr:
        update.priceIdr !== undefined
          ? update.priceIdr
          : Number(existing.priceIdr),
      compareAtPriceIdr:
        update.compareAtPriceIdr !== undefined
          ? (update.compareAtPriceIdr ?? undefined)
          : existing.compareAtPriceIdr === null
            ? undefined
            : Number(existing.compareAtPriceIdr),
      category: update.category ?? existing.category,
      imageUrl:
        update.imageUrl !== undefined
          ? (update.imageUrl ?? '')
          : (existing.imageUrl ?? ''),
      items: update.items ?? existing.items ?? [],
      hasVariants: update.hasVariants ?? existing.hasVariants,
      variants: update.variants ?? existing.variants ?? undefined,
      installmentConfig:
        update.installmentConfig !== undefined
          ? (update.installmentConfig ?? undefined)
          : (existing.installmentConfig ?? undefined),
      isActive: update.isActive ?? existing.isActive,
    };
  }

  private assertBusinessRules(product: {
    title: string;
    priceIdr: number;
    items: ProductItem[];
    hasVariants: boolean;
    variants?: ProductVariantDto[];
  }) {
    if (!product.title.trim()) {
      throw new BadRequestException('Product title is required');
    }

    if (product.priceIdr < 0) {
      throw new BadRequestException('Product price must be zero or positive');
    }

    // `db.sql` allows `products.items` to be an empty jsonb array.
    // FE can create a product first, then entitlement items can be filled later.

    if (product.hasVariants && !(product.variants && product.variants.length)) {
      throw new BadRequestException(
        'Products with variants must include at least one variant',
      );
    }
  }

  private async resolvePublicId(
    requestedId: string | undefined,
    title: string,
  ): Promise<string> {
    const baseCandidate = requestedId
      ? this.normalizePublicId(requestedId)
      : this.normalizePublicId(`PRD-${title}`);

    let candidate = baseCandidate;
    let suffix = 1;

    while (await this.publicIdExists(candidate)) {
      suffix += 1;
      candidate = `${baseCandidate}-${suffix}`;
    }

    return candidate;
  }

  private normalizePublicId(value: string): string {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    if (!normalized) {
      throw new ConflictException('Product ID could not be generated');
    }

    return normalized;
  }

  private async publicIdExists(publicId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      'select exists(select 1 from products where public_id = $1) as exists',
      [publicId],
    );

    return result.rows[0]?.exists ?? false;
  }
}
