/**
 * MAXWELL ERP - Transactions Service
 * Handles checkout, payment, and entitlement processing
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Transaction, TransactionItem, Refund } from './entities';
import {
  CheckoutDto,
  TransactionQueryDto,
  CreateRefundDto,
  MidtransWebhookDto,
} from './dto';
import { DbService } from '../../common/db.service';

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DbService) {}

  // ==========================================================================
  // CHECKOUT & PAYMENT
  // ==========================================================================

  /**
   * Process checkout and create transaction
   */
  async checkout(
    userId: string | null,
    dto: CheckoutDto,
  ): Promise<{
    transaction: Transaction;
    paymentUrl?: string;
    vaNumber?: string;
    qrString?: string;
  }> {
    // Untuk versi awal: hitung harga berdasarkan tabel `products`
    // dan simpan satu record di `payment_transactions`.

    // 1. Ambil produk terkait
    const productIds = dto.items.map((i) => i.productId);
    const productsRes = await this.db.query<{
      id: string;
      title: string;
      priceIdr: number;
    }>(
      `
      select id, title, "priceIdr"
      from products
      where id = any($1::uuid[])
      `,
      [productIds],
    );
    const products = productsRes.rows;
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found');
    }

    // 2. Hitung subtotal (tanpa voucher/tax dulu)
    let subtotal = 0;
    dto.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId)!;
      subtotal += prod.priceIdr * item.quantity;
    });

    const discountAmount = 0;
    const taxAmount = 0;
    const totalAmount = subtotal - discountAmount + taxAmount;

    // 3. Tentukan email customer
    let customerEmail: string | null = null;
    if (dto.guestEmail) {
      customerEmail = dto.guestEmail;
    } else if (userId) {
      const memberRes = await this.db.query<{ email: string }>(
        'select email from members where id = $1',
        [userId],
      );
      customerEmail = memberRes.rows[0]?.email ?? null;
    }
    if (!customerEmail) {
      throw new BadRequestException(
        'Either guestEmail or a member with email is required',
      );
    }

    // 4. Insert ke payment_transactions
    const now = new Date();
    const expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 jam
    const orderId = `ORD-${now.getTime()}`;

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
        null,
        null,
        null,
        null,
        null,
        $9::jsonb
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

    // Belum ada VA/QR dari gateway; frontend bisa langsung pakai `transactionNumber`
    return { transaction };
  }

  /**
   * Handle Midtrans webhook notification
   */
  async handleMidtransWebhook(dto: MidtransWebhookDto): Promise<void> {
    // 1. Verify signature
    // 2. Find transaction by midtrans_order_id
    // 3. Update payment status based on transaction_status

    if (
      dto.transaction_status === 'settlement' ||
      dto.transaction_status === 'capture'
    ) {
      // Payment success - trigger entitlement engine
      await this.processPaymentSuccess(dto.order_id);
    } else if (
      dto.transaction_status === 'expire' ||
      dto.transaction_status === 'cancel'
    ) {
      // Payment failed - release reserved stock
      await this.processPaymentFailed(dto.order_id);
    }
    // pending, deny, etc - just log
  }

  /**
   * Process successful payment - create wallet items
   */
  async processPaymentSuccess(transactionId: string): Promise<void> {
    // TODO: Begin atomic transaction

    // 1. Get transaction and items
    // 2. Update transaction status to PAID
    // 3. For each item, read product_entitlements
    // 4. Create member_wallet items based on entitlements
    // 5. Log wallet_transactions (Type: PURCHASE)
    // 6. Update transaction entitlementProcessed = true
    // 7. Trigger automation (send email, etc)

    // TODO: Commit transaction
    throw new Error('Not implemented - needs database');
  }

  /**
   * Process failed/expired payment
   */
  async processPaymentFailed(transactionId: string): Promise<void> {
    // 1. Update transaction status
    // 2. Release reserved stock
    throw new Error('Not implemented - needs database');
  }

  // ==========================================================================
  // TRANSACTION QUERIES
  // ==========================================================================

  /**
   * Get user's transactions
   */
  async findMyTransactions(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<{ data: Transaction[]; total: number }> {
    // Cari email dari tabel members berdasarkan userId
    const memberRes = await this.db.query<{ email: string }>(
      'select email from members where id = $1',
      [userId],
    );
    const email = memberRes.rows[0]?.email;
    if (!email) {
      return { data: [], total: 0 };
    }

    return this.queryPaymentsByEmail(email, query);
  }

  /**
   * Get all transactions (Admin)
   */
  async findAll(
    query: TransactionQueryDto,
  ): Promise<{ data: Transaction[]; total: number }> {
    return this.queryPaymentsByEmail(null, query);
  }

  /**
   * Get transaction by ID
   */
  async findOne(
    id: string,
  ): Promise<Transaction & { items: TransactionItem[] }> {
    const paymentsRes = await this.db.query<{
      id: string;
      orderId: string;
      totalAmount: number;
      amount: number;
      discountAmount: number | null;
      status: string;
      method: string;
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

    const row = paymentsRes.rows[0];
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

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  /**
   * Create refund request
   */
  async createRefund(dto: CreateRefundDto): Promise<Refund> {
    // 1. Verify transaction exists and is PAID
    // 2. Verify refund amount <= transaction total
    // 3. Create refund record
    throw new Error('Not implemented - needs database');
  }

  /**
   * Approve refund (Admin)
   */
  async approveRefund(refundId: string, approvedBy: string): Promise<Refund> {
    // TODO: Update refund status to APPROVED
    throw new Error('Not implemented - needs database');
  }

  /**
   * Process refund (Finance)
   */
  async processRefund(refundId: string): Promise<Refund> {
    // TODO: Begin atomic transaction

    // 1. Update refund status to PROCESSED
    // 2. Revoke wallet items if needed
    // 3. Create ledger entries for refund
    // 4. Update transaction status

    // TODO: Commit transaction
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
  async getSalesSummary(startDate: Date, endDate: Date) {
    const res = await this.db.query<{
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
    );

    const row = res.rows[0];
    return {
      totalAmount: parseFloat(row.totalAmount ?? '0'),
      count: parseInt(row.count, 10) || 0,
    };
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  private async queryPaymentsByEmail(
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

    const { rows, total } = await this.db.paginatedQuery<{
      id: string;
      orderId: string;
      totalAmount: number;
      amount: number;
      discountAmount: number | null;
      status: string;
      method: string;
      createdAt: string;
      customerEmail: string;
      itemsSnapshot: any[] | null;
    }>(baseSql, params, page, limit);

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
    createdAt: string;
    customerEmail: string;
  }): Transaction {
    const subtotal = row.amount;
    const discountAmount = row.discountAmount ?? 0;
    const taxAmount = 0;

    return {
      id: row.id,
      transactionNumber: row.orderId,
      userId: null,
      guestEmail: row.customerEmail,
      guestName: null,
      guestPhone: null,
      subtotalAmount: subtotal,
      discountAmount,
      taxAmount,
      totalAmount: row.totalAmount,
      paymentStatus: row.status,
      paymentMethod: row.method,
      paidAmount: row.status === 'PAID' ? row.totalAmount : 0,
      paidAt: null,
      midtransOrderId: null,
      midtransTransactionId: null,
      midtransPaymentType: null,
      midtransVaNumber: null,
      midtransQrString: null,
      midtransRedirectUrl: null,
      midtransResponse: {},
      paymentExpiresAt: null,
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
    };
  }
}
