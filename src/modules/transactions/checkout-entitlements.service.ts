/**
 * Server-side checkout → wallet: expands product BOM from DB and upserts wallet_items
 * when a payment row is PAID. Idempotent via payment_transactions."entitlementProcessed".
 */

import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DbService } from '../../common/db.service';
import {
  ProductsService,
  type PgQueryExecutor,
} from '../products/products.service';
import { WalletService } from '../wallet/wallet.service';
import { MembersService } from '../members/members.service';
import {
  Product,
  ProductItem,
  ProductEntitlementType,
} from '../products/entities';

interface PaymentEntitlementRow {
  id: string;
  orderId: string;
  customerEmail: string;
  buyerUserId: string | null;
  itemsSnapshot: Array<{
    productId: string;
    quantity: number;
    variantId?: string | null;
  }> | null;
}

interface EventTicketContext {
  id: string;
  name: string;
  date: string;
  location: string;
  locationMode: string;
  onlineMeetingLink: string | null;
}

const CREDIT_TAG_DESCRIPTIONS: Record<string, string> = {
  MLCT_FULL: 'Mentorship / program class credits',
  FLEX_CREDIT_2025: 'Flexible credit for standard classes',
  TICKET_JAN_25: 'Single entry ticket credits',
  SERIES_2025_FULL: 'Annual pass credits',
};

/** jsonb is usually parsed by node-pg; tolerate string / legacy double-encoding. */
function parseItemsSnapshot(
  raw: unknown,
): Array<{ productId: string; quantity: number; variantId?: string | null }> {
  if (Array.isArray(raw)) {
    return raw as Array<{
      productId: string;
      quantity: number;
      variantId?: string | null;
    }>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const once = JSON.parse(raw) as unknown;
      if (Array.isArray(once)) {
        return once as Array<{
          productId: string;
          quantity: number;
          variantId?: string | null;
        }>;
      }
      if (typeof once === 'string' && once.trim()) {
        const twice = JSON.parse(once) as unknown;
        if (Array.isArray(twice)) {
          return twice as Array<{
            productId: string;
            quantity: number;
            variantId?: string | null;
          }>;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

@Injectable()
export class CheckoutEntitlementsService {
  private readonly logger = new Logger(CheckoutEntitlementsService.name);

  constructor(
    private readonly db: DbService,
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly wallet: WalletService,
    private readonly members: MembersService,
  ) {}

  /**
   * Grants wallet items for a PAID payment (webhook, simulate-settle, Rp 0 checkout).
   * No-op if already processed or not PAID.
   */
  async processForPaymentId(paymentId: string): Promise<void> {
    const id = paymentId.trim();
    if (!id) return;

    const peek = await this.db.query<PaymentEntitlementRow>(
      `
      select
        id::text as id,
        "orderId" as "orderId",
        "customerEmail" as "customerEmail",
        "buyerUserId" as "buyerUserId",
        "itemsSnapshot" as "itemsSnapshot"
      from payment_transactions
      where id = $1::uuid
        and upper(status) = 'PAID'
        and coalesce("entitlementProcessed", false) = false
      limit 1
      `,
      [id],
    );
    const peekRow = peek.rows[0];
    if (!peekRow) {
      return;
    }
    // Runs on the pool (not inside FOR UPDATE): avoids nested `pool.connect` while a
    // checkout transaction client is already checked out — fixes "timeout exceeded when trying to connect".
    await this.members.ensureCrmMemberForPurchaseEmail(peekRow.customerEmail);

    await this.db.withTransaction(async (client) => {
      const sel = await client.query<PaymentEntitlementRow>(
        `
        select
          id::text as id,
          "orderId" as "orderId",
          "customerEmail" as "customerEmail",
          "buyerUserId" as "buyerUserId",
          "itemsSnapshot" as "itemsSnapshot"
        from payment_transactions
        where id = $1::uuid
          and upper(status) = 'PAID'
          and coalesce("entitlementProcessed", false) = false
        for update
        `,
        [id],
      );
      const row = sel.rows[0];
      if (!row) {
        return;
      }

      const walletOwnerId = await this.resolveWalletOwnerId(
        row.buyerUserId,
        row.customerEmail,
      );

      if (!walletOwnerId) {
        this.logger.warn(
          `Checkout entitlements: no wallet owner for payment ${row.id} (email=${row.customerEmail}); leaving entitlementProcessed=false so a later sync (member/JWT) can retry.`,
        );
        return;
      }

      const snapshot = parseItemsSnapshot(row.itemsSnapshot);
      if (snapshot.length === 0) {
        await client.query(
          `
          update payment_transactions
          set "entitlementProcessed" = true,
              "entitlementProcessedAt" = now()
          where id = $1::uuid
          `,
          [row.id],
        );
        return;
      }

      const eventCache = new Map<string, EventTicketContext | null>();
      type WalletMutation = {
        id: string;
        userId: string;
        type: string;
        title: string;
        subtitle: string;
        status: string;
        isTransferable?: boolean;
        expiryDate?: string | null;
        qrData?: string | null;
        meta?: Record<string, unknown>;
      };
      const mutations: WalletMutation[] = [];

      for (const line of snapshot) {
        const qty = Math.max(1, Number(line.quantity) || 1);
        const rawLine = line as Record<string, unknown>;
        const productKey =
          (typeof rawLine.productId === 'string' && rawLine.productId.trim()) ||
          (typeof rawLine.product_id === 'string' && rawLine.product_id.trim()) ||
          (typeof rawLine.id === 'string' && rawLine.id.trim()) ||
          '';
        if (!productKey) {
          this.logger.warn(
            `Checkout entitlements: snapshot line missing productId for payment ${row.id}`,
          );
          continue;
        }
        let product: Product;
        try {
          product = await this.products.findOne(productKey, client);
        } catch {
          this.logger.warn(
            `Checkout entitlements: product ${productKey} not found for payment ${row.id}`,
          );
          continue;
        }
        const variantKey =
          rawLine.variantId != null && String(rawLine.variantId).trim()
            ? String(rawLine.variantId).trim()
            : undefined;
        const bom = this.resolveBomLines(product, variantKey);
        const chunk = await this.expandBomToWalletItems({
          walletUserId: walletOwnerId,
          paymentId: row.id,
          orderId: row.orderId,
          product,
          bom,
          cartQty: qty,
          eventCache,
          sql: client,
        });
        mutations.push(...chunk);
      }

      if (snapshot.length > 0 && mutations.length === 0) {
        this.logger.error(
          `Checkout entitlements: payment ${row.id} has ${snapshot.length} snapshot line(s) but expanded to 0 wallet rows (check productId / BOM / variants).`,
        );
        throw new BadRequestException(
          'Checkout could not create wallet items: product bundle is empty or invalid for this order. In Store Admin, set bundle items (e.g. Digital → DIGITAL_LINK with Resource URL), save the product, then try again.',
        );
      }

      for (const item of mutations) {
        await this.wallet.upsertWalletItem(item, client);
        const balance =
          item.type === 'CREDIT_PASS' &&
          item.meta &&
          typeof item.meta['credits'] === 'number'
            ? Number(item.meta['credits'])
            : 0;
        await this.wallet.logWalletHistory(
          {
            id: `TX-PUR-${item.id}-${Date.now()}`,
            walletItemId: item.id,
            userId: walletOwnerId,
            transactionType: 'PURCHASE',
            amountChange: item.type === 'CREDIT_PASS' ? balance : 1,
            balanceAfter: balance,
            referenceId: row.id,
            referenceName: item.title,
            timestamp: new Date().toISOString(),
          },
          client,
        );
      }

      await client.query(
        `
        update payment_transactions
        set "entitlementProcessed" = true,
            "entitlementProcessedAt" = now()
        where id = $1::uuid
        `,
        [row.id],
      );
    });
  }

  private async resolveWalletOwnerId(
    buyerUserId: string | null | undefined,
    customerEmail: string,
  ): Promise<string | null> {
    const trimmedBuyer = String(buyerUserId ?? '').trim();
    if (trimmedBuyer) {
      return trimmedBuyer;
    }
    const email = String(customerEmail ?? '').trim();
    if (!email) {
      return null;
    }
    // Prefer Prisma workspace `User.id` (JWT `sub` / session `user.id`) so wallet rows
    // match GET /wallet/items?userId=… when the buyer signs in later.
    const workspaceUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (workspaceUser) {
      return workspaceUser.id;
    }
    return this.members.findMemberIdByEmail(email);
  }

  private resolveBomLines(product: Product, variantId?: string): ProductItem[] {
    const parentItems = Array.isArray(product.items) ? product.items : [];
    if (product.hasVariants && product.variants?.length) {
      const vid = String(variantId ?? '').trim();
      if (vid) {
        const v = product.variants.find((x) => x.id === vid);
        if (v?.items?.length) {
          return v.items;
        }
      }
      if (parentItems.length) {
        return parentItems;
      }
      const firstWithItems = product.variants.find((vv) => vv.items?.length);
      if (firstWithItems?.items?.length) {
        return firstWithItems.items;
      }
      return [];
    }
    return parentItems;
  }

  private async expandBomToWalletItems(ctx: {
    walletUserId: string;
    paymentId: string;
    orderId: string;
    product: Product;
    bom: ProductItem[];
    cartQty: number;
    eventCache: Map<string, EventTicketContext | null>;
    /** Transaction-scoped SQL (same `pg` client as wallet upserts) — never `this.db` here. */
    sql: PgQueryExecutor;
  }): Promise<
    Array<{
      id: string;
      userId: string;
      type: string;
      title: string;
      subtitle: string;
      status: string;
      isTransferable?: boolean;
      expiryDate?: string | null;
      qrData?: string | null;
      meta?: Record<string, unknown>;
    }>
  > {
    const out: Array<{
      id: string;
      userId: string;
      type: string;
      title: string;
      subtitle: string;
      status: string;
      isTransferable?: boolean;
      expiryDate?: string | null;
      qrData?: string | null;
      meta?: Record<string, unknown>;
    }> = [];

    const stamp = () =>
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const baseMeta = {
      sourceTransactionId: ctx.paymentId,
      sourceOrderId: ctx.orderId,
      sourceProductId: ctx.product.id,
    };

    for (const bom of ctx.bom) {
      const lineUnits = Math.max(1, Number(bom.quantity) || 1) * ctx.cartQty;
      const rawType = bom.type as string | undefined;
      const type =
        typeof rawType === 'string' && rawType.trim()
          ? rawType.trim().toUpperCase()
          : '';
      const normalizedType: ProductEntitlementType | '' =
        type === 'DIGITAL'
          ? 'DIGITAL_LINK'
          : (type as ProductEntitlementType);

      switch (normalizedType) {
        case 'TICKET': {
          const eventId = String(bom.meta?.['eventId'] ?? '').trim();
          await this.ensureEventInCache(eventId, ctx.eventCache, ctx.sql);
          const evt = eventId ? (ctx.eventCache.get(eventId) ?? null) : null;

          for (let i = 0; i < lineUnits; i++) {
            const id = `W-TKT-${stamp()}-${i}`;
            out.push({
              id,
              userId: ctx.walletUserId,
              type: 'TICKET',
              title: bom.name,
              subtitle: evt?.name || 'Event admission',
              status: 'ACTIVE',
              isTransferable: Boolean(
                (bom.meta as { isTransferable?: boolean } | undefined)
                  ?.isTransferable ?? true,
              ),
              expiryDate: evt?.date ?? null,
              qrData: evt
                ? `TICKET:${evt.id}:${ctx.walletUserId}:${id}`
                : `TICKET:${eventId || 'UNKNOWN'}:${ctx.walletUserId}:${id}`,
              meta: {
                ...baseMeta,
                ...(bom.meta && typeof bom.meta === 'object' ? bom.meta : {}),
                eventId: eventId || undefined,
                targetTier: (bom.meta as { targetTier?: string } | undefined)
                  ?.targetTier,
                location: evt?.location,
                locationMode: evt?.locationMode,
                onlineMeetingLink: evt?.onlineMeetingLink ?? undefined,
              },
            });
          }
          break;
        }
        case 'EVENT_CREDIT':
        case 'RECURRING_PASS': {
          const id = `W-CR-${stamp()}`;
          const meta = bom.meta ?? {};
          const creditTag =
            typeof meta['creditTag'] === 'string' ? meta['creditTag'] : '';
          const unlimited = Boolean(meta['isUnlimited']);
          const credits = unlimited ? 999_999 : lineUnits;
          const subtitle =
            (creditTag && CREDIT_TAG_DESCRIPTIONS[creditTag]) ||
            'Program credits';
          out.push({
            id,
            userId: ctx.walletUserId,
            type: 'CREDIT_PASS',
            title: bom.name,
            subtitle,
            status: 'ACTIVE',
            isTransferable: Boolean(meta['isTransferable'] ?? false),
            expiryDate: this.resolveCreditExpiry(meta),
            meta: {
              ...baseMeta,
              ...meta,
              credits,
              creditTag: creditTag || undefined,
              isUnlimited: unlimited,
            },
          });
          break;
        }
        case 'PHYSICAL': {
          for (let i = 0; i < lineUnits; i++) {
            const id = `W-PHY-${stamp()}-${i}`;
            const meta = bom.meta ?? {};
            out.push({
              id,
              userId: ctx.walletUserId,
              type: 'PHYSICAL_ORDER',
              title: bom.name,
              subtitle: 'Preparing shipment',
              status: 'PROCESSING',
              isTransferable: false,
              meta: {
                ...baseMeta,
                ...meta,
                skuRef: meta['skuRef'],
                productId: ctx.product.id,
              },
            });
          }
          break;
        }
        case 'DIGITAL_LINK': {
          for (let i = 0; i < lineUnits; i++) {
            const id = `W-DIG-${stamp()}-${i}`;
            const meta = bom.meta ?? {};
            const urlRaw =
              (typeof meta['url'] === 'string' && meta['url']) ||
              (typeof meta['link'] === 'string' && meta['link']) ||
              '';
            out.push({
              id,
              userId: ctx.walletUserId,
              type: 'DIGITAL_CONTENT',
              title: bom.name,
              subtitle: urlRaw
                ? 'Tap to open your access link'
                : 'Digital access',
              status: 'ACTIVE',
              isTransferable: Boolean(meta['isTransferable'] ?? false),
              expiryDate: this.resolveCreditExpiry(meta),
              meta: {
                ...baseMeta,
                ...meta,
                url: urlRaw || undefined,
              },
            });
          }
          break;
        }
        default:
          this.logger.warn(
            `Unknown BOM type "${String(rawType)}" on product ${ctx.product.id}`,
          );
      }
    }

    return out;
  }

  private resolveCreditExpiry(meta: Record<string, unknown>): string | null {
    if (meta['isUnlimited']) {
      return null;
    }
    const exp = meta['expiration'];
    if (typeof exp === 'string' && exp.trim()) {
      return exp.trim();
    }
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  private async ensureEventInCache(
    eventId: string,
    cache: Map<string, EventTicketContext | null>,
    sql: PgQueryExecutor = this.db,
  ): Promise<void> {
    if (!eventId || cache.has(eventId)) {
      return;
    }
    const trimmed = eventId.trim();
    const res = await sql.query<EventTicketContext>(
      `
      select
        coalesce(e.public_id, e.id::text) as id,
        e.name as name,
        to_char(e.date, 'YYYY-MM-DD') as date,
        coalesce(e.location, '') as location,
        coalesce(e."locationMode"::text, 'OFFLINE') as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink"
      from events e
      where (
        e.public_id is not null
        and btrim(e.public_id) <> ''
        and lower(btrim(e.public_id)) = lower(btrim($1::text))
      )
      or e.id::text = $1::text
      limit 1
      `,
      [trimmed],
    );
    cache.set(eventId, res.rows[0] ?? null);
  }
}
