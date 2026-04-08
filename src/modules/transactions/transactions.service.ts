/**
 * MAXWELL ERP - Transactions Service
 * Handles checkout, payment, and entitlement processing
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Transaction, TransactionItem, Refund } from './entities';
import {
  CheckoutDto,
  TransactionQueryDto,
  CreateRefundDto,
  MidtransWebhookDto,
} from './dto';
import { DbService } from '../../common/db.service';
import { AppConfigService } from '../../common/config/app-config.service';
import { MidtransService } from '../midtrans/midtrans.service';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly db: DbService,
    private readonly midtrans: MidtransService,
    private readonly config: AppConfigService,
  ) {}

  // ==========================================================================
  // CHECKOUT & PAYMENT
  // ==========================================================================

  private normalizeIdempotencyKey(key?: string): string | null {
    const normalized = String(key ?? '').trim();
    if (!normalized) return null;
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(normalized)) {
      throw new BadRequestException(
        'Invalid idempotency key format (8-120 chars, alphanumeric/:-_)',
      );
    }
    return normalized;
  }

  private buildIdempotentOrderId(
    purpose: 'checkout' | 'snap',
    customerEmail: string,
    idempotencyKey: string,
  ): string {
    const digest = createHash('sha256')
      .update(`${purpose}:${customerEmail.toLowerCase()}:${idempotencyKey}`)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();
    return `ORD-${purpose.toUpperCase()}-${digest}`;
  }

  private async appendSecurityLog(
    action: string,
    context: Record<string, unknown>,
    actorUserId?: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO system_security_logs (id, "userId", action, context)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb)`,
      [actorUserId ?? null, action, JSON.stringify(context)],
    );
  }

  private async resolveAttributionSource(
    rawSource: string | undefined,
  ): Promise<string | null> {
    const normalized = String(rawSource ?? '').trim().toLowerCase();
    if (!normalized) return null;
    const found = await this.db.query<{ sourceCode: string }>(
      `select "sourceCode" from campaigns where lower("sourceCode") = $1 limit 1`,
      [normalized],
    );
    return found.rows[0]?.sourceCode ?? null;
  }

  /**
   * Process checkout and create transaction
   */
  async checkout(
    userId: string | null,
    dto: CheckoutDto,
    idempotencyKey?: string,
  ): Promise<{
    transaction: Transaction;
    paymentUrl?: string;
    vaNumber?: string;
    qrString?: string;
  }> {
    // Untuk versi awal: hitung harga berdasarkan tabel `products`
    // dan simpan satu record di `payment_transactions`.

    // 1. Ambil produk terkait (ambil harga dari DB, bukan FE)
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const hasProductsPublicId = await this.hasProductsPublicId();
    const productsRes = await this.db.query<{
      id: string;
      lookupId: string;
      title: string;
      category: string;
      priceIdr: number;
      isActive: boolean;
    }>(
      hasProductsPublicId
        ? `
      select
        id::text as "id",
        public_id::text as "lookupId",
        title,
        category,
        "priceIdr" as "priceIdr",
        "isActive" as "isActive"
      from products
      where public_id::text = any($1::text[])
        or id::text = any($1::text[])
      `
        : `
      select
        id::text as "id",
        id::text as "lookupId",
        title,
        category,
        "priceIdr" as "priceIdr",
        "isActive" as "isActive"
      from products
      where id::text = any($1::text[])
      `,
      [productIds],
    );

    const products = productsRes.rows;
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found');
    }

    // 2. Hitung subtotal + (voucher) + PPN (config via env)
    //    Anti-tamper: totalAmount yang dipakai midtrans selalu hasil hitung ulang BE.
    let subtotalRaw = 0;
    dto.items.forEach((item) => {
      const prod = products.find(
        (product) =>
          product.id === item.productId || product.lookupId === item.productId,
      );
      if (!prod) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }
      if (!prod.isActive) {
        throw new BadRequestException(`Product ${item.productId} is not active`);
      }
      if (!Number.isFinite(Number(prod.priceIdr)) || Number(prod.priceIdr) <= 0) {
        throw new BadRequestException('Product price must be > 0');
      }

      subtotalRaw += Number(prod.priceIdr) * item.quantity;
    });

    const subtotal = Math.round(subtotalRaw);
    const pricing = await this.calculatePricing(dto, products, subtotal, userId);

    const discountAmount = pricing.discountAmount;
    const taxAmount = pricing.taxAmount;
    const totalAmount = pricing.totalAmount;

    if (totalAmount <= 0) {
      throw new BadRequestException('Invalid totalAmount');
    }

    // 3. Tentukan email customer
    let customerEmail: string | null = null;
    if (dto.guestEmail) {
      customerEmail = dto.guestEmail;
    } else if (userId) {
      customerEmail = await this.findMemberEmail(userId);
    }
    if (!customerEmail) {
      throw new BadRequestException(
        'Either guestEmail or a member with email is required',
      );
    }

    const attributionSource = await this.resolveAttributionSource(
      dto.attributionSource,
    );

    // 4. Insert ke payment_transactions
    const now = new Date();
    const expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 jam
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    const orderId = normalizedIdempotencyKey
      ? this.buildIdempotentOrderId('checkout', customerEmail, normalizedIdempotencyKey)
      : `ORD-${now.getTime()}`;

    const paymentRes = await this.db.query<{
      id: string;
      orderId: string;
      totalAmount: number;
      status: string;
      method: string;
      createdAt: string;
      customerEmail: string;
    }>(
      `
      insert into payment_transactions (
        id,
        "orderId",
        amount,
        "discountAmount",
        "uniqueCode",
        "totalAmount",
        "paidAmount",
        "balanceDue",
        "installmentPlan",
        refunds,
        method,
        status,
        "createdAt",
        "expiryTime",
        "customerEmail",
        "attributionSource",
        "virtualAccountNumber",
        "qrisUrl",
        "bankDetails",
        "proofOfPaymentUrl",
        "itemsSnapshot"
      )
      values (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        null,
        $4,
        0,
        $4,
        null,
        null,
        $5,
        'PENDING',
        $6,
        $7,
        $8,
        $9,
        null,
        null,
        null,
        null,
        $10::jsonb
      )
      returning id, "orderId", "totalAmount", status, method, "createdAt", "customerEmail"
      `,
      [
        orderId,
        subtotal,
        discountAmount,
        totalAmount,
        dto.paymentMethod,
        now.toISOString(),
        expiry.toISOString(),
        customerEmail,
        attributionSource,
        JSON.stringify(
          dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        ),
      ],
    );

    const payment = paymentRes.rows[0];

    // 5. Map ke Transaction entity (supaya kompatibel dengan frontend)
    const transaction: Transaction = {
      id: payment.id,
      transactionNumber: payment.orderId,
      userId,
      guestEmail: dto.guestEmail ?? null,
      guestName: dto.guestName ?? null,
      guestPhone: dto.guestPhone ?? null,
      subtotalAmount: subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentStatus: payment.status,
      paymentMethod: dto.paymentMethod,
      paidAmount: 0,
      paidAt: null,
      midtransOrderId: null,
      midtransTransactionId: null,
      midtransPaymentType: null,
      midtransVaNumber: null,
      midtransQrString: null,
      midtransRedirectUrl: null,
      midtransResponse: {},
      paymentExpiresAt: expiry,
      voucherId: null,
      voucherCode: dto.voucherCode ?? null,
      type: 'SALE',
      originalTransactionId: null,
      entitlementProcessed: false,
      entitlementProcessedAt: null,
      referrerUserId: null,
      salesUserId: null,
      internalNotes: null,
      customerNotes: dto.customerNotes ?? null,
      metadata: {},
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.createdAt),
    };

    // 6. Create Midtrans charge so we get VA/QR data server-side.
    // Anti-tamper: gross_amount Midtrans diambil dari totalAmount BE (bukan dari FE).
    const grossAmount = Math.round(totalAmount);
    const midtransCharge = await this.midtrans.charge({
      orderId: payment.orderId,
      grossAmount,
      method: dto.paymentMethod as any,
      customerEmail,
    });

    await this.db.query(
      `
      update payment_transactions
      set
        "virtualAccountNumber" = $1,
        "qrisUrl" = $2,
        "bankDetails" = $3::jsonb
      where id = $4
      `,
      [
        midtransCharge.vaNumber ?? null,
        midtransCharge.qrisUrl ?? null,
        midtransCharge.bankDetails ? JSON.stringify(midtransCharge.bankDetails) : null,
        payment.id,
      ],
    );

    transaction.midtransVaNumber = midtransCharge.vaNumber ?? null;
    transaction.virtualAccountNumber = midtransCharge.vaNumber ?? null;
    transaction.midtransPaymentType = midtransCharge.paymentType ?? null;
    transaction.midtransQrString = null;
    transaction.qrisUrl = midtransCharge.qrisUrl ?? null;
    transaction.bankDetails = midtransCharge.bankDetails ?? null;

    return { transaction };
  }

  /**
   * Create a Midtrans Snap token and persist `payment_transactions` row first
   * so that webhook correlation works via payment_transactions."orderId".
   */
  async createMidtransSnap(
    userId: string | null,
    dto: CheckoutDto,
    idempotencyKey?: string,
  ): Promise<{
    transaction: Transaction;
    snapToken: string;
    redirectUrl?: string;
  }> {
    // 1) Load products from DB (anti-tamper: FE must not control pricing)
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const hasProductsPublicId = await this.hasProductsPublicId();
    const productsRes = await this.db.query<{
      id: string;
      lookupId: string;
      title: string;
      category: string;
      priceIdr: number;
      isActive: boolean;
    }>(
      hasProductsPublicId
        ? `
      select
        id::text as "id",
        public_id::text as "lookupId",
        title,
        category,
        "priceIdr" as "priceIdr",
        "isActive" as "isActive"
      from products
      where public_id::text = any($1::text[])
        or id::text = any($1::text[])
      `
        : `
      select
        id::text as "id",
        id::text as "lookupId",
        title,
        category,
        "priceIdr" as "priceIdr",
        "isActive" as "isActive"
      from products
      where id::text = any($1::text[])
      `,
      [productIds],
    );

    const products = productsRes.rows;
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found');
    }

    // 2) Compute subtotal/discount/tax/total
    let subtotalRaw = 0;
    dto.items.forEach((item) => {
      const prod = products.find(
        (p) => p.id === item.productId || p.lookupId === item.productId,
      );
      if (!prod) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }
      if (!prod.isActive) {
        throw new BadRequestException(
          `Product ${item.productId} is not active`,
        );
      }
      if (!Number.isFinite(Number(prod.priceIdr)) || Number(prod.priceIdr) <= 0) {
        throw new BadRequestException('Product price must be > 0');
      }
      subtotalRaw += Number(prod.priceIdr) * item.quantity;
    });

    const subtotal = Math.round(subtotalRaw);
    const pricing = await this.calculatePricing(dto, products, subtotal, userId);

    const discountAmount = pricing.discountAmount;
    const taxAmount = pricing.taxAmount;
    const totalAmount = pricing.totalAmount;

    if (totalAmount <= 0) {
      throw new BadRequestException('Invalid totalAmount');
    }

    // 3) Determine customer email
    let customerEmail: string | null = null;
    if (dto.guestEmail) {
      customerEmail = dto.guestEmail;
    } else if (userId) {
      customerEmail = await this.findMemberEmail(userId);
    }
    if (!customerEmail) {
      throw new BadRequestException(
        'Either guestEmail or a member with email is required',
      );
    }

    const attributionSource = await this.resolveAttributionSource(
      dto.attributionSource,
    );

    // 4) Persist payment row first so webhook can correlate.
    const now = new Date();
    const expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    const orderId = normalizedIdempotencyKey
      ? this.buildIdempotentOrderId('snap', customerEmail, normalizedIdempotencyKey)
      : `ORD-${now.getTime()}`;

    if (normalizedIdempotencyKey) {
      const existing = await this.db.query<{
        id: string;
        orderId: string;
        totalAmount: number;
        amount: number;
        discountAmount: number | null;
        status: string;
        method: string;
        paidAmount: number;
        expiryTime: string;
        virtualAccountNumber: string | null;
        qrisUrl: string | null;
        bankDetails: any;
        createdAt: string;
        customerEmail: string;
        itemsSnapshot: any[] | null;
      }>(
        `select *
         from payment_transactions
         where "orderId" = $1
         limit 1`,
        [orderId],
      );
      const row = existing.rows[0];
      if (row) {
        if (String(row.status).toUpperCase() === 'PAID') {
          throw new BadRequestException(
            'Transaction for this idempotency key is already paid',
          );
        }
        const existingTx = this.mapPaymentRowToTransaction(row);
        const snap = await this.midtrans.createSnapToken({
          orderId: row.orderId,
          grossAmount: Math.round(Number(row.totalAmount)),
          customerEmail: row.customerEmail,
        });
        return {
          transaction: existingTx,
          snapToken: snap.token,
          redirectUrl: snap.redirect_url,
        };
      }
    }

    const paymentRes = await this.db.query<{
      id: string;
      orderId: string;
      totalAmount: number;
      status: string;
      method: string;
      createdAt: string;
      customerEmail: string;
    }>(
      `
      insert into payment_transactions (
        id,
        "orderId",
        amount,
        "discountAmount",
        "uniqueCode",
        "totalAmount",
        "paidAmount",
        "balanceDue",
        "installmentPlan",
        refunds,
        method,
        status,
        "createdAt",
        "expiryTime",
        "customerEmail",
        "attributionSource",
        "virtualAccountNumber",
        "qrisUrl",
        "bankDetails",
        "proofOfPaymentUrl",
        "itemsSnapshot"
      )
      values (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        null,
        $4,
        0,
        $4,
        null,
        null,
        $5,
        'PENDING',
        $6,
        $7,
        $8,
        $9,
        null,
        null,
        null,
        null,
        $10::jsonb
      )
      returning id, "orderId", "totalAmount", status, method, "createdAt", "customerEmail"
      `,
      [
        orderId,
        subtotal,
        discountAmount,
        totalAmount,
        dto.paymentMethod,
        now.toISOString(),
        expiry.toISOString(),
        customerEmail,
        attributionSource,
        JSON.stringify(
          dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        ),
      ],
    );

    const payment = paymentRes.rows[0];

    // 5) Create Snap token using gross_amount from BE.
    const grossAmount = Math.round(totalAmount);
    const snap = await this.midtrans.createSnapToken({
      orderId: payment.orderId,
      grossAmount,
      customerEmail,
    });

    // 6) Map to Transaction entity for FE.
    const transaction: Transaction = {
      id: payment.id,
      transactionNumber: payment.orderId,
      userId,
      guestEmail: dto.guestEmail ?? null,
      guestName: null,
      guestPhone: null,
      subtotalAmount: subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentStatus: payment.status,
      paymentMethod: dto.paymentMethod,
      paidAmount: 0,
      paidAt: null,
      midtransOrderId: null,
      midtransTransactionId: null,
      midtransPaymentType: null,
      midtransVaNumber: null,
      midtransQrString: null,
      midtransRedirectUrl: null,
      midtransResponse: {},
      paymentExpiresAt: expiry,
      voucherId: null,
      voucherCode: dto.voucherCode ?? null,
      type: 'SALE',
      originalTransactionId: null,
      entitlementProcessed: false,
      entitlementProcessedAt: null,
      referrerUserId: null,
      salesUserId: null,
      internalNotes: null,
      customerNotes: dto.customerNotes ?? null,
      metadata: {},
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.createdAt),
      virtualAccountNumber: null,
      qrisUrl: null,
      bankDetails: null,
    };

    return {
      transaction,
      snapToken: snap.token,
      redirectUrl: snap.redirect_url,
    };
  }

  // Note: We intentionally do NOT override `enabled_payments` here.
  // Snap will follow the payment channels enabled in the Midtrans Snap preference dashboard.

  /**
   * Handle Midtrans webhook notification
   */
  async handleMidtransWebhook(
    dto: MidtransWebhookDto,
    _signatureHeader?: string,
  ): Promise<void> {
    // 1. Verify signature (prevents forged webhook payloads)
    this.midtrans.verifySignature(dto);

    // 2. Find transaction by Midtrans order_id
    const tx = await this.findByMidtransOrderId(dto.order_id);
    if (!tx) return;
    const currentStatus = String(tx.paymentStatus ?? '').toUpperCase();

    // 3. Anti-tamper: webhook gross_amount must match what we created.
    const webhookGross = Math.round(parseFloat(dto.gross_amount));
    const expectedGross = Math.round(Number(tx.totalAmount));
    if (!Number.isFinite(webhookGross) || webhookGross !== expectedGross) {
      await this.db.query(
        `
        update payment_transactions
        set status = 'FAILED'
        where "orderId" = $1
        `,
        [dto.order_id],
      );
      return;
    }

    // 4. Update payment status
    if (
      dto.transaction_status === 'settlement' ||
      dto.transaction_status === 'capture'
    ) {
      const paid = await this.db.query<{
        attributionSource: string | null;
        totalAmount: number;
      }>(
        `
        update payment_transactions
        set
          status = 'PAID',
          "paidAmount" = "totalAmount",
          "balanceDue" = 0
        where "orderId" = $1
          and status <> 'PAID'
        returning "attributionSource", "totalAmount"
        `,
        [dto.order_id],
      );

      const paidRow = paid.rows[0];
      if (paidRow?.attributionSource) {
        await this.db.query(
          `
          update campaigns
          set
            conversions = conversions + 1,
            revenue = revenue + $2
          where "sourceCode" = $1
          `,
          [paidRow.attributionSource, Number(paidRow.totalAmount) || 0],
        );
      }
      await this.appendSecurityLog('PAYMENT_WEBHOOK_PAID', {
        orderId: dto.order_id,
        transactionStatus: dto.transaction_status,
        paymentType: dto.payment_type,
      });
      return;
    }

    if (dto.transaction_status === 'expire') {
      if (currentStatus === 'PAID') return;
      await this.db.query(
        `
        update payment_transactions
        set
          status = 'EXPIRED',
          "paidAmount" = 0,
          "balanceDue" = "totalAmount"
        where "orderId" = $1
          and status <> 'PAID'
        `,
        [dto.order_id],
      );
      await this.appendSecurityLog('PAYMENT_WEBHOOK_EXPIRED', {
        orderId: dto.order_id,
        transactionStatus: dto.transaction_status,
      });
      return;
    }

    if (dto.transaction_status === 'cancel') {
      if (currentStatus === 'PAID') return;
      await this.db.query(
        `
        update payment_transactions
        set
          status = 'CANCELLED',
          "paidAmount" = 0,
          "balanceDue" = "totalAmount"
        where "orderId" = $1
          and status <> 'PAID'
        `,
        [dto.order_id],
      );
      await this.appendSecurityLog('PAYMENT_WEBHOOK_CANCELLED', {
        orderId: dto.order_id,
        transactionStatus: dto.transaction_status,
      });
      return;
    }

    if (dto.transaction_status === 'deny' || dto.transaction_status === 'failure') {
      if (currentStatus === 'PAID') return;
      await this.db.query(
        `
        update payment_transactions
        set
          status = 'FAILED',
          "paidAmount" = 0,
          "balanceDue" = "totalAmount"
        where "orderId" = $1
          and status <> 'PAID'
        `,
        [dto.order_id],
      );
      await this.appendSecurityLog('PAYMENT_WEBHOOK_FAILED', {
        orderId: dto.order_id,
        transactionStatus: dto.transaction_status,
      });
      return;
    }

    // pending, pending_review, etc => no-op
  }

  /**
   * Process successful payment - create wallet items
   */
  async processPaymentSuccess(transactionId: string): Promise<void> {
    // Legacy hook. Current webhook handler updates status directly.
    await this.db.query(
      `
      update payment_transactions
      set
        status = 'PAID',
        "paidAmount" = "totalAmount",
        "balanceDue" = 0
      where "orderId" = $1
      `,
      [transactionId],
    );
  }

  /**
   * Process failed/expired payment
   */
  async processPaymentFailed(transactionId: string): Promise<void> {
    // Legacy hook. Current webhook handler updates status directly.
    await this.db.query(
      `
      update payment_transactions
      set
        status = 'FAILED',
        "paidAmount" = 0,
        "balanceDue" = "totalAmount"
      where "orderId" = $1
      `,
      [transactionId],
    );
  }

  // ==========================================================================
  // PRICING HELPERS (server-side anti-tamper)
  // ==========================================================================

  private async hasProductsPublicId(): Promise<boolean> {
    // Some environments may still have `public_id` on `products`.
    // We detect it at runtime to avoid SQL errors when the column doesn't exist.
    const res = await this.db.query<{ exists: boolean }>(`
      select exists (
        select 1
        from information_schema.columns
        where table_name = 'products' and column_name = 'public_id'
      ) as "exists"
    `);

    return res.rows[0]?.exists ?? false;
  }

  private async calculatePricing(
    dto: CheckoutDto,
    products: Array<{
      id: string;
      lookupId?: string;
      category: string;
      priceIdr: number;
      isActive: boolean;
    }>,
    subtotal: number,
    userId: string | null,
  ): Promise<{ discountAmount: number; taxAmount: number; totalAmount: number }> {
    // NOTE: userId currently unused for voucher scopes in this first implementation.
    // The goal is to ensure totals sent to Midtrans always come from BE calculations.
    let discountAmount = 0;

    if (dto.voucherCode) {
      const code = dto.voucherCode.trim().toUpperCase();
      discountAmount = await this.calculateDiscountAmount(code, dto.items, products);
    }

    const taxableAmount = Math.max(0, subtotal - Math.round(discountAmount));
    const ppnRate = this.config.paymentPpnRatePercent / 100;
    const taxAmount = Math.round(taxableAmount * ppnRate);
    const totalAmount = taxableAmount + taxAmount;

    return { discountAmount: Math.round(discountAmount), taxAmount, totalAmount };
  }

  private async calculateDiscountAmount(
    code: string,
    cartItems: CheckoutDto['items'],
    products: Array<{
      id: string;
      lookupId?: string;
      category: string;
      priceIdr: number;
      isActive: boolean;
    }>,
  ): Promise<number> {
    const discountRes = await this.db.query<{
      type: string;
      value: number;
      scope: string;
      targetIds: string[] | null;
      minQty: number | null;
      validFrom: Date;
      validUntil: Date;
      maxUsageLimit: number | null;
      currentUsageCount: number;
      maxBudgetLimit: number | null;
      currentBudgetBurned: number;
    }>(
      `
      select
        type,
        value,
        scope,
        "targetIds",
        "minQty",
        "validFrom",
        "validUntil",
        "maxUsageLimit",
        "currentUsageCount",
        "maxBudgetLimit",
        "currentBudgetBurned"
      from discounts
      where code = $1
      limit 1
      `,
      [code],
    );

    const discount = discountRes.rows[0];
    if (!discount) return 0;

    const now = new Date();
    if (discount.validFrom && discount.validFrom > now) return 0;
    if (discount.validUntil && discount.validUntil < now) return 0;
    if (discount.maxUsageLimit !== null && discount.currentUsageCount >= discount.maxUsageLimit) return 0;
    if (discount.maxBudgetLimit !== null && discount.currentBudgetBurned >= discount.maxBudgetLimit) return 0;

    let totalDiscount = 0;

    for (const cartItem of cartItems) {
      const product = products.find(
        (p) => p.id === cartItem.productId || p.lookupId === cartItem.productId,
      );
      if (!product) continue;
      const qty = cartItem.quantity;
      if (qty <= 0) continue;

      const productMatchesLookup = (targetId: string | undefined | null) =>
        !!targetId && (targetId === product.id || targetId === product.lookupId);

      const applicable =
        discount.scope === 'GLOBAL' ||
        discount.scope === 'ABAC_COMPLEX' ||
        (discount.scope === 'CATEGORY_SPECIFIC' && discount.targetIds?.includes(product.category)) ||
        (discount.scope === 'Product_SPECIFIC' &&
          discount.targetIds?.some((tid) => productMatchesLookup(tid))) ||
        (discount.scope === 'EVENT_SPECIFIC' &&
          discount.targetIds?.some((tid) => productMatchesLookup(tid)));

      if (!applicable) continue;

      // BUNDLE_VOLUME: only apply when qty >= minQty (when provided)
      if (discount.type === 'BUNDLE_VOLUME' && discount.minQty !== null && qty < discount.minQty) {
        continue;
      }

      const unitPrice = Number(product.priceIdr);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

      if (discount.type === 'PERCENTAGE' || discount.type === 'BUNDLE_VOLUME') {
        // Percent discount is per-unit, multiplied by quantity.
        const unitDiscount = unitPrice * (Number(discount.value) / 100);
        totalDiscount += unitDiscount * qty;
      } else if (discount.type === 'FIXED_AMOUNT') {
        // Fixed discount applied once per cart line (mimics FE PaymentModal behaviour).
        const unitDiscount = Math.min(Number(discount.value), unitPrice);
        totalDiscount += unitDiscount;
      }
    }

    return Math.max(0, Math.round(totalDiscount));
  }

  // ==========================================================================
  // TRANSACTION QUERIES
  // ==========================================================================

  /**
   * Get user's transactions
   */
  async findMyTransactions(
    userId: string,
    role: string,
    query: TransactionQueryDto,
  ): Promise<{ data: Transaction[]; total: number }> {
    const email = await this.findMemberEmail(userId);
    if (!email) {
      return { data: [], total: 0 };
    }
    return this.db.withRlsContext(userId, role, async (client) =>
      this.queryPaymentsByEmailWithClient(client, email, query),
    );
  }

  /**
   * Get all transactions (Admin)
   */
  async findAll(
    actorUserId: string,
    actorRole: string,
    query: TransactionQueryDto,
  ): Promise<{ data: Transaction[]; total: number }> {
    return this.db.withRlsContext(actorUserId, actorRole, async (client) =>
      this.queryPaymentsByEmailWithClient(client, null, query),
    );
  }

  /**
   * Get transaction by ID
   */
  async findOne(
    id: string,
  ): Promise<Transaction & { items: TransactionItem[] }> {
    const row = await this.getPaymentRowById(id);
    if (!row) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const tx = this.mapPaymentRowToTransaction(row);
    const items: TransactionItem[] =
      (row.itemsSnapshot as any[] | null)?.map((i, idx) => ({
        id: `${row.id}-ITEM-${idx}`,
        transactionId: row.id,
        productId: i.productId,
        productName: i.productId,
        productType: 'UNKNOWN',
        quantity: i.quantity,
        unitPrice: row.totalAmount,
        discountAmount: 0,
        totalPrice: row.totalAmount,
        pricingTierId: null,
        pricingTierName: null,
        entitlementProcessed: false,
        createdAt: new Date(row.createdAt),
      })) ?? [];

    return { ...tx, items };
  }

  async findOneForUser(
    id: string,
    userId: string,
    role: string,
  ): Promise<Transaction & { items: TransactionItem[] }> {
    const normalizedRole = String(role ?? '').trim();
    const isPrivileged =
      normalizedRole === 'Finance' || normalizedRole === 'Super Admin';
    if (isPrivileged) {
      return this.findOne(id);
    }

    const email = await this.findMemberEmail(userId);
    if (!email) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const row = await this.getPaymentRowById(id);
    if (!row || String(row.customerEmail).toLowerCase() !== email.toLowerCase()) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const tx = this.mapPaymentRowToTransaction(row);
    const items: TransactionItem[] =
      (row.itemsSnapshot as any[] | null)?.map((i, idx) => ({
        id: `${row.id}-ITEM-${idx}`,
        transactionId: row.id,
        productId: i.productId,
        productName: i.productId,
        productType: 'UNKNOWN',
        quantity: i.quantity,
        unitPrice: row.totalAmount,
        discountAmount: 0,
        totalPrice: row.totalAmount,
        pricingTierId: null,
        pricingTierName: null,
        entitlementProcessed: false,
        createdAt: new Date(row.createdAt),
      })) ?? [];

    return { ...tx, items };
  }

  private async getPaymentRowById(id: string): Promise<{
    id: string;
    orderId: string;
    totalAmount: number;
    amount: number;
    discountAmount: number | null;
    status: string;
    method: string;
    paidAmount: number;
    expiryTime: string;
    virtualAccountNumber: string | null;
    qrisUrl: string | null;
    bankDetails: any;
    createdAt: string;
    customerEmail: string;
    itemsSnapshot: any[] | null;
  } | null> {
    const paymentsRes = await this.db.query<{
      id: string;
      orderId: string;
      totalAmount: number;
      amount: number;
      discountAmount: number | null;
      status: string;
      method: string;
      paidAmount: number;
      expiryTime: string;
      virtualAccountNumber: string | null;
      qrisUrl: string | null;
      bankDetails: any;
      createdAt: string;
      customerEmail: string;
      itemsSnapshot: any[] | null;
    }>(
      `
      select *
      from payment_transactions
      where id = $1
      `,
      [id],
    );

    return paymentsRes.rows[0] ?? null;
  }

  /**
   * Get transaction by Midtrans order ID
   */
  async findByMidtransOrderId(orderId: string): Promise<Transaction | null> {
    const res = await this.db.query<{
      id: string;
      orderId: string;
      totalAmount: number;
      amount: number;
      discountAmount: number | null;
      status: string;
      method: string;
      paidAmount: number;
      expiryTime: string;
      virtualAccountNumber: string | null;
      qrisUrl: string | null;
      bankDetails: any;
      createdAt: string;
      customerEmail: string;
      itemsSnapshot: any[] | null;
    }>(
      `
      select *
      from payment_transactions
      where "orderId" = $1
      `,
      [orderId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.mapPaymentRowToTransaction(row);
  }

  async getPublicPaymentStatus(
    transactionId: string,
    customerEmail: string,
  ): Promise<{ paymentStatus: string; totalAmount: number }> {
    const email = String(customerEmail ?? '').trim().toLowerCase();
    const res = await this.db.query<{
      status: string;
      totalAmount: number;
    }>(
      `
      select status, "totalAmount"
      from payment_transactions
      where id = $1
        and lower("customerEmail") = $2
      limit 1
      `,
      [transactionId, email],
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }
    return { paymentStatus: row.status, totalAmount: Number(row.totalAmount) || 0 };
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  /**
   * Create refund request
   */
  async createRefund(
    dto: CreateRefundDto,
    actorUserId: string,
  ): Promise<Refund> {
    // 1. Verify transaction exists and is PAID
    // 2. Verify refund amount <= transaction total
    // 3. Create refund record
    await this.appendSecurityLog(
      'REFUND_REQUEST_ATTEMPT',
      { transactionId: dto.transactionId, refundAmount: dto.refundAmount },
      actorUserId,
    );
    throw new Error('Not implemented - needs database');
  }

  /**
   * Approve refund (Admin)
   */
  async approveRefund(refundId: string, approvedBy: string): Promise<Refund> {
    // TODO: Update refund status to APPROVED
    await this.appendSecurityLog(
      'REFUND_APPROVE_ATTEMPT',
      { refundId },
      approvedBy,
    );
    throw new Error('Not implemented - needs database');
  }

  /**
   * Process refund (Finance)
   */
  async processRefund(refundId: string, actorUserId: string): Promise<Refund> {
    // TODO: Begin atomic transaction

    // 1. Update refund status to PROCESSED
    // 2. Revoke wallet items if needed
    // 3. Create ledger entries for refund
    // 4. Update transaction status

    // TODO: Commit transaction
    await this.appendSecurityLog(
      'REFUND_PROCESS_ATTEMPT',
      { refundId },
      actorUserId,
    );
    throw new Error('Not implemented - needs database');
  }

  // ==========================================================================
  // VOUCHER VALIDATION
  // ==========================================================================

  /**
   * Validate and apply voucher
   */
  async validateVoucher(
    code: string,
    userId: string | null,
    cartTotal: number,
    productIds: string[],
  ): Promise<{ valid: boolean; discount: number; message?: string }> {
    // 1. Find voucher by code
    // 2. Check validity period
    // 3. Check usage limits
    // 4. Check applicable products
    // 5. Calculate discount
    throw new Error('Not implemented - needs database');
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get sales summary
   */
  async getSalesSummary(
    actorUserId: string,
    actorRole: string,
    startDate: Date,
    endDate: Date,
  ) {
    const res = await this.db.withRlsContext(actorUserId, actorRole, async (client) =>
      client.query<{
      totalAmount: string | null;
      count: string;
    }>(
      `
      select
        coalesce(sum("totalAmount"), 0)::text as "totalAmount",
        count(*)::text as count
      from payment_transactions
      where "createdAt" between $1 and $2
        and status in ('PENDING', 'PAID')
      `,
      [startDate.toISOString(), endDate.toISOString()],
    ));

    const row = res.rows[0];
    return {
      totalAmount: parseFloat(row.totalAmount ?? '0'),
      count: parseInt(row.count, 10) || 0,
    };
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  private async queryPaymentsByEmailWithClient(
    client: PoolClient,
    email: string | null,
    query: TransactionQueryDto,
  ): Promise<{ data: Transaction[]; total: number }> {
    const { page, limit, status, startDate, endDate } = query;
    const params: any[] = [];
    const where: string[] = [];

    if (email) {
      params.push(email);
      where.push(`pt."customerEmail" = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`pt.status = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate.toISOString());
      where.push(`pt."createdAt" >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate.toISOString());
      where.push(`pt."createdAt" <= $${params.length}`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const baseSql = `
      select *
      from payment_transactions pt
      ${whereSql}
      order by pt."createdAt" desc
    `;

    const offset = (page - 1) * limit;
    const wrapped = `
      with base as (
        ${baseSql}
      )
      select jsonb_build_object(
        'data', (select coalesce(jsonb_agg(b), '[]'::jsonb) from (select * from base limit $${params.length + 2} offset $${params.length + 1}) b),
        'total', (select count(*) from base)
      ) as result
    `;
    const result = await client.query<{ result: { data: any[]; total: string } }>(
      wrapped,
      [...params, offset, limit],
    );
    const payload = result.rows[0]?.result ?? { data: [], total: '0' };
    const rows = payload.data as Array<{
      id: string;
      orderId: string;
      totalAmount: number;
      amount: number;
      discountAmount: number | null;
      status: string;
      method: string;
      paidAmount: number;
      expiryTime: string;
      virtualAccountNumber: string | null;
      qrisUrl: string | null;
      bankDetails: any;
      createdAt: string;
      customerEmail: string;
      itemsSnapshot: any[] | null;
    }>;
    const total = parseInt(payload.total, 10) || 0;

    return {
      data: rows.map((r) => this.mapPaymentRowToTransaction(r)),
      total,
    };
  }

  private mapPaymentRowToTransaction(row: {
    id: string;
    orderId: string;
    totalAmount: number;
    amount: number;
    discountAmount: number | null;
    status: string;
    method: string;
    paidAmount?: number;
    expiryTime?: string;
    virtualAccountNumber?: string | null;
    qrisUrl?: string | null;
    bankDetails?: any;
    createdAt: string;
    customerEmail: string;
  }): Transaction {
    const subtotal = row.amount;
    const discountAmount = row.discountAmount ?? 0;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.max(0, row.totalAmount - taxableAmount);

    return {
      id: row.id,
      transactionNumber: row.orderId,
      userId: null,
      guestEmail: row.customerEmail,
      guestName: null,
      guestPhone: null,
      subtotalAmount: subtotal,
      discountAmount,
      taxAmount: Math.round(taxAmount),
      totalAmount: row.totalAmount,
      paymentStatus: row.status,
      paymentMethod: row.method,
      paidAmount: Number(row.paidAmount ?? 0),
      paidAt: null,
      midtransOrderId: null,
      midtransTransactionId: null,
      midtransPaymentType: null,
      midtransVaNumber: row.virtualAccountNumber ?? null,
      midtransQrString: null,
      midtransRedirectUrl: null,
      midtransResponse: {},
      paymentExpiresAt: row.expiryTime ? new Date(row.expiryTime) : null,
      voucherId: null,
      voucherCode: null,
      type: 'SALE',
      originalTransactionId: null,
      entitlementProcessed: false,
      entitlementProcessedAt: null,
      referrerUserId: null,
      salesUserId: null,
      internalNotes: null,
      customerNotes: null,
      metadata: {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.createdAt),
      virtualAccountNumber: row.virtualAccountNumber ?? null,
      qrisUrl: row.qrisUrl ?? null,
      bankDetails: row.bankDetails ?? null,
    };
  }

  private async findMemberEmail(identifier: string): Promise<string | null> {
    const memberRes = await this.db.query<{ email: string }>(
      `
      select email
      from members
      where id::text = $1
      `,
      [identifier],
    );

    return memberRes.rows[0]?.email ?? null;
  }
}
