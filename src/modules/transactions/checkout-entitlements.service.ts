/**
 * Server-side checkout → wallet: expands product BOM from DB and upserts wallet_items
 * when a payment row is PAID. Idempotent via payment_transactions."entitlementProcessed".
 */

import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { ProductsService } from '../products/products.service';
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

@Injectable()
export class CheckoutEntitlementsService {
  private readonly logger = new Logger(CheckoutEntitlementsService.name);

  constructor(
    private readonly db: DbService,
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
          `Checkout entitlements: no wallet owner for payment ${row.id} (email=${row.customerEmail}); marking processed to avoid retries.`,
        );
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

      const snapshot = Array.isArray(row.itemsSnapshot) ? row.itemsSnapshot : [];
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
        let product: Product;
        try {
          product = await this.products.findOne(String(line.productId));
        } catch {
          this.logger.warn(
            `Checkout entitlements: product ${line.productId} not found for payment ${row.id}`,
          );
          continue;
        }
        const bom = this.resolveBomLines(product, line.variantId ?? undefined);
        const chunk = await this.expandBomToWalletItems({
          walletUserId: walletOwnerId,
          paymentId: row.id,
          orderId: row.orderId,
          product,
          bom,
          cartQty: qty,
          eventCache,
        });
        mutations.push(...chunk);
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
    return this.members.findMemberIdByEmail(customerEmail);
  }

  private resolveBomLines(product: Product, variantId?: string): ProductItem[] {
    if (product.hasVariants && variantId) {
      const v = product.variants?.find((x) => x.id === variantId);
      if (v?.items?.length) {
        return v.items;
      }
    }
    return product.items ?? [];
  }

  private async expandBomToWalletItems(ctx: {
    walletUserId: string;
    paymentId: string;
    orderId: string;
    product: Product;
    bom: ProductItem[];
    cartQty: number;
    eventCache: Map<string, EventTicketContext | null>;
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
      const type = bom.type as ProductEntitlementType;

      switch (type) {
        case 'TICKET': {
          const eventId = String(
            (bom.meta as Record<string, unknown> | undefined)?.['eventId'] ??
              '',
          ).trim();
          await this.ensureEventInCache(eventId, ctx.eventCache);
          const evt = eventId ? ctx.eventCache.get(eventId) ?? null : null;

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
                ...(bom.meta && typeof bom.meta === 'object'
                  ? (bom.meta as Record<string, unknown>)
                  : {}),
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
          const meta = (bom.meta ?? {}) as Record<string, unknown>;
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
            const meta = (bom.meta ?? {}) as Record<string, unknown>;
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
            const meta = (bom.meta ?? {}) as Record<string, unknown>;
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
            `Unknown BOM type "${String(type)}" on product ${ctx.product.id}`,
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
  ): Promise<void> {
    if (!eventId || cache.has(eventId)) {
      return;
    }
    try {
      const res = await this.db.query<EventTicketContext>(
        `
        select
          e.id::text as id,
          e.name as name,
          e.date::text as date,
          e.location as location,
          e."locationMode" as "locationMode",
          e."onlineMeetingLink" as "onlineMeetingLink"
        from events e
        where e.id = $1::uuid
        limit 1
        `,
        [eventId],
      );
      cache.set(eventId, res.rows[0] ?? null);
    } catch {
      cache.set(eventId, null);
    }
  }
}
