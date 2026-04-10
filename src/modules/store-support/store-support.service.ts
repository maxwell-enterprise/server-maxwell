import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { MembersService } from '../members/members.service';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Stable UUID-shaped id for non-UUID FE keys (e.g. TPL-SHIPPING, CHK-123). */
function uuidFromFeId(kind: 'tpl' | 'chk', feId: string): string {
  const hash = createHash('sha256').update(`${kind}:${feId}`).digest();
  const buf = Buffer.from(hash.subarray(0, 16));
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function resolveOpsRowId(feId: string, kind: 'tpl' | 'chk'): string {
  return isUuid(feId) ? feId : uuidFromFeId(kind, feId);
}

function toIso(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** Ledger + store support: pricing_rules, discounts, inventory, transactions (finance ledger). */
@Injectable()
export class StoreSupportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly members: MembersService,
  ) {}

  // --- pricing_rules: full PricingRule JSON in conditions + feRuleId ---

  async listPricingRules(): Promise<unknown[]> {
    const result = await this.db.query<
      Record<string, unknown> & {
        conditions: unknown;
        targetProductIds: unknown;
      }
    >(
      `SELECT id, "feRuleId", name, description, segment, "targetProductIds", conditions,
              "maxBudget", "currentSpend", "createdAt", "updatedAt"
       FROM pricing_rules
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => this.rowToPricingRule(r));
  }

  private rowToPricingRule(row: Record<string, unknown>): unknown {
    const doc = parseJson<Record<string, unknown>>(row.conditions, {});
    if (
      doc &&
      typeof doc.id === 'string' &&
      typeof doc.type === 'string' &&
      doc.budget &&
      doc.action
    ) {
      return doc;
    }
    const ids = Array.isArray(row.targetProductIds)
      ? (row.targetProductIds as string[])
      : parseJson<string[]>(row.targetProductIds, []);
    return {
      id: (row.feRuleId as string) ?? String(row.id),
      name: row.name,
      description: row.description ?? '',
      type: (row.segment as string) || 'MEMBER_TIER',
      priority: 0,
      isActive: true,
      isStackable: true,
      condition: {
        targetProductIds: ids,
        ...(typeof doc === 'object' && doc ? (doc.condition as object) : {}),
      },
      budget: {
        maxBudget: Number(row.maxBudget ?? 0),
        currentSpend: Number(row.currentSpend ?? 0),
        autoDisableOnDepletion: true,
      },
      action: { type: 'PERCENTAGE_OFF' as const, value: 0 },
    };
  }

  async upsertPricingRule(
    feId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const rule: Record<string, unknown> = { ...body, id: feId };
    const name = String(rule.name ?? 'Rule');
    const description = String(rule.description ?? '');
    const segment = String(rule.type ?? 'MEMBER_TIER');
    const condition = (rule.condition as Record<string, unknown>) || {};
    const budget = (rule.budget as Record<string, unknown>) || {};
    const targetProductIds = Array.isArray(condition.targetProductIds)
      ? (condition.targetProductIds as string[])
      : [];
    const maxBudget = Number(budget.maxBudget ?? rule.maxBudget ?? 0);
    const currentSpend = Number(budget.currentSpend ?? rule.currentSpend ?? 0);
    const conditionsJson = JSON.stringify(rule);

    await this.db.query(
      `INSERT INTO pricing_rules (id, "feRuleId", name, description, segment, "targetProductIds", conditions, "maxBudget", "currentSpend")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::text[], $6::jsonb, $7, $8)
       ON CONFLICT ("feRuleId") DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         segment = EXCLUDED.segment,
         "targetProductIds" = EXCLUDED."targetProductIds",
         conditions = EXCLUDED.conditions,
         "maxBudget" = EXCLUDED."maxBudget",
         "currentSpend" = EXCLUDED."currentSpend",
         "updatedAt" = now()`,
      [
        feId,
        name,
        description,
        segment,
        targetProductIds,
        conditionsJson,
        maxBudget,
        currentSpend,
      ],
    );
  }

  async deletePricingRule(feId: string): Promise<void> {
    let r = await this.db.query(
      `DELETE FROM pricing_rules WHERE "feRuleId" = $1`,
      [feId],
    );
    if ((r.rowCount ?? 0) === 0) {
      r = await this.db.query(
        `DELETE FROM pricing_rules WHERE conditions->>'id' = $1`,
        [feId],
      );
    }
    if ((r.rowCount ?? 0) === 0) {
      await this.db.query(`DELETE FROM pricing_rules WHERE id::text = $1`, [
        feId,
      ]);
    }
  }

  // --- discounts (db.sql shape) ---

  async listDiscounts(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, "feId", code, title, description, type, value, scope, "targetIds",
              "validFrom", "validUntil", "maxUsageLimit", "currentUsageCount",
              "maxBudgetLimit", "currentBudgetBurned", "isFeatured", conditions, "minQty", "createdAt"
       FROM discounts
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => this.rowToDiscount(r));
  }

  private rowToDiscount(row: Record<string, unknown>): unknown {
    const targetIds = Array.isArray(row.targetIds)
      ? (row.targetIds as string[])
      : parseJson<string[]>(row.targetIds, []);
    return {
      id: (row.feId as string) ?? String(row.id),
      code: String(row.code),
      title: String(row.title),
      description: row.description != null ? String(row.description) : '',
      type: row.type,
      value: Number(row.value),
      scope: row.scope,
      targetIds,
      validFrom: toIso(row.validFrom),
      validUntil: toIso(row.validUntil),
      maxUsageLimit:
        row.maxUsageLimit != null ? Number(row.maxUsageLimit) : undefined,
      currentUsageCount: Number(row.currentUsageCount ?? 0),
      maxBudgetLimit:
        row.maxBudgetLimit != null ? Number(row.maxBudgetLimit) : undefined,
      currentBudgetBurned: Number(row.currentBudgetBurned ?? 0),
      isFeatured: Boolean(row.isFeatured),
      conditions:
        row.conditions != null
          ? parseJson(row.conditions, undefined)
          : undefined,
      minQty: row.minQty != null ? Number(row.minQty) : undefined,
    };
  }

  async upsertDiscount(
    feId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const code = String(body.code ?? feId);
    const title = String(body.title ?? code);
    const description = String(body.description ?? '');
    const type = String(body.type ?? 'PERCENTAGE');
    const value = Number(body.value ?? 0);
    const scope = String(body.scope ?? 'GLOBAL');
    const targetIds = Array.isArray(body.targetIds)
      ? (body.targetIds as string[])
      : [];
    const validFrom = body.validFrom
      ? String(body.validFrom)
      : new Date().toISOString();
    const validUntil = body.validUntil
      ? String(body.validUntil)
      : new Date(Date.now() + 864e14).toISOString();
    const maxUsageLimit =
      body.maxUsageLimit != null && body.maxUsageLimit !== ''
        ? Number(body.maxUsageLimit)
        : null;
    const currentUsageCount = Number(body.currentUsageCount ?? 0);
    const maxBudgetLimit =
      body.maxBudgetLimit != null && body.maxBudgetLimit !== ''
        ? Number(body.maxBudgetLimit)
        : null;
    const currentBudgetBurned = Number(body.currentBudgetBurned ?? 0);
    const isFeatured = Boolean(body.isFeatured);
    const conditions =
      body.conditions !== undefined && body.conditions !== null
        ? JSON.stringify(body.conditions)
        : null;
    const minQty =
      body.minQty != null && body.minQty !== '' ? Number(body.minQty) : null;

    await this.db.query(
      `INSERT INTO discounts (id, "feId", code, title, description, type, value, scope, "targetIds",
        "validFrom", "validUntil", "maxUsageLimit", "currentUsageCount", "maxBudgetLimit", "currentBudgetBurned",
        "isFeatured", conditions, "minQty")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::text[], $9::timestamptz, $10::timestamptz,
        $11, $12, $13, $14, $15, $16::jsonb, $17)
       ON CONFLICT ("feId") DO UPDATE SET
         code = EXCLUDED.code,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         type = EXCLUDED.type,
         value = EXCLUDED.value,
         scope = EXCLUDED.scope,
         "targetIds" = EXCLUDED."targetIds",
         "validFrom" = EXCLUDED."validFrom",
         "validUntil" = EXCLUDED."validUntil",
         "maxUsageLimit" = EXCLUDED."maxUsageLimit",
         "currentUsageCount" = EXCLUDED."currentUsageCount",
         "maxBudgetLimit" = EXCLUDED."maxBudgetLimit",
         "currentBudgetBurned" = EXCLUDED."currentBudgetBurned",
         "isFeatured" = EXCLUDED."isFeatured",
         conditions = EXCLUDED.conditions,
         "minQty" = EXCLUDED."minQty"`,
      [
        feId,
        code,
        title,
        description,
        type,
        value,
        scope,
        targetIds,
        validFrom,
        validUntil,
        maxUsageLimit,
        currentUsageCount,
        maxBudgetLimit,
        currentBudgetBurned,
        isFeatured,
        conditions,
        minQty,
      ],
    );
  }

  async deleteDiscount(feId: string): Promise<void> {
    await this.db.query(`DELETE FROM discounts WHERE "feId" = $1`, [feId]);
    await this.db.query(`DELETE FROM discounts WHERE id::text = $1`, [feId]);
  }

  // --- inventory ---

  async listInventory(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT sku, name, category, stock, "reorderLevel", status, price
       FROM inventory
       ORDER BY sku`,
    );
    return result.rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      category: r.category ?? '',
      stock: Number(r.stock ?? 0),
      reorderLevel: Number(r.reorderLevel ?? 0),
      status: r.status,
      price: Number(r.price ?? 0),
    }));
  }

  async upsertInventory(
    sku: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const name = String(body.name ?? sku);
    const category = String(body.category ?? 'General');
    const stock = Number(body.stock ?? 0);
    const reorderLevel = Number(body.reorderLevel ?? 0);
    const status = String(body.status ?? 'In Stock');
    const price = Number(body.price ?? 0);

    await this.db.query(
      `INSERT INTO inventory (sku, name, category, stock, "reorderLevel", status, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         stock = EXCLUDED.stock,
         "reorderLevel" = EXCLUDED."reorderLevel",
         status = EXCLUDED.status,
         price = EXCLUDED.price`,
      [sku, name, category, stock, reorderLevel, status, price],
    );
  }

  async listInventoryTransactions(limit = 200): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id::text AS id, "feId", sku, type, quantity, "balanceAfter", reference, "performedBy", timestamp
       FROM inventory_transactions
       ORDER BY timestamp DESC
       LIMIT $1`,
      [Math.min(limit, 500)],
    );
    return result.rows.map((r) => ({
      id: (r.feId as string) || String(r.id),
      sku: r.sku,
      type: r.type,
      quantity: Number(r.quantity),
      balanceAfter: Number(r.balanceAfter),
      reference: r.reference ?? '',
      performedBy: r.performedBy ?? '',
      timestamp: toIso(r.timestamp),
    }));
  }

  async createInventoryTransaction(
    body: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const rawId = body.id != null ? String(body.id) : null;
    const pk = rawId && isUuid(rawId) ? rawId : randomUUID();
    const feId = rawId && !isUuid(rawId) ? rawId : null;
    const sku = String(body.sku ?? '');
    const type = String(body.type ?? 'ADJUSTMENT');
    const quantity = Number(body.quantity ?? 0);
    const balanceAfter = Number(body.balanceAfter ?? 0);
    const reference = String(body.reference ?? '');
    const performedBy = String(body.performedBy ?? 'system');

    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO inventory_transactions (id, "feId", sku, type, quantity, "balanceAfter", reference, "performedBy")
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
       RETURNING COALESCE("feId", id::text) AS id`,
      [pk, feId, sku, type, quantity, balanceAfter, reference, performedBy],
    );
    const id = ins.rows[0]?.id;
    if (!id) throw new Error('Failed to insert inventory transaction');
    return { id };
  }

  // --- finance ledger: table transactions ---

  async findLedgerTransactions(params?: {
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown[]> {
    const conditions: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    if (params?.type) {
      conditions.push(`type = $${i++}`);
      args.push(params.type);
    }
    if (params?.status) {
      conditions.push(`status = $${i++}`);
      args.push(params.status);
    }
    if (params?.startDate) {
      conditions.push(`date >= $${i++}::date`);
      args.push(params.startDate);
    }
    if (params?.endDate) {
      conditions.push(`date <= $${i++}::date`);
      args.push(params.endDate);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(params?.limit ?? 100, 500);
    const offset = params?.offset ?? 0;
    const lim = i++;
    const off = i++;
    args.push(limit, offset);

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id::text AS id, legacy_id, date, type, description, amount, status, "eventId", "createdAt", "updatedAt"
       FROM transactions
       ${where}
       ORDER BY date DESC, "createdAt" DESC
       LIMIT $${lim} OFFSET $${off}`,
      args,
    );
    return result.rows.map((r) => this.rowToLedgerTransaction(r));
  }

  private rowToLedgerTransaction(row: Record<string, unknown>): unknown {
    const legacy = row.legacy_id != null ? String(row.legacy_id) : undefined;
    const id = legacy ?? String(row.id);
    let eventId: string | undefined;
    if (row.eventId != null) {
      eventId = String(row.eventId);
    }
    const dateVal = row.date;
    const dateStr =
      dateVal instanceof Date
        ? dateVal.toISOString().slice(0, 10)
        : String(dateVal ?? '').slice(0, 10);
    return {
      id,
      legacy_id: legacy,
      date: dateStr,
      type: row.type,
      description: row.description,
      amount: Number(row.amount),
      status: row.status,
      eventId,
      createdAt: row.createdAt != null ? toIso(row.createdAt) : undefined,
      updatedAt: row.updatedAt != null ? toIso(row.updatedAt) : undefined,
    };
  }

  async createLedgerTransaction(
    body: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const feId = body.id != null ? String(body.id) : null;
    const dateRaw = body.date
      ? String(body.date)
      : new Date().toISOString().slice(0, 10);
    const type = String(body.type ?? 'Expense');
    const description = String(body.description ?? '');
    const amount = Number(body.amount ?? 0);
    const status = String(body.status ?? 'Pending');
    const eventRaw = body.eventId != null ? String(body.eventId) : null;
    const eventId = eventRaw && isUuid(eventRaw) ? eventRaw : null;

    const rowId = feId && isUuid(feId) ? feId : randomUUID();
    const legacyId = feId && !isUuid(feId) ? feId : null;

    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO transactions (id, legacy_id, date, type, description, amount, status, "eventId")
       VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7, $8::uuid)
       RETURNING COALESCE(legacy_id, id::text) AS id`,
      [rowId, legacyId, dateRaw, type, description, amount, status, eventId],
    );
    const id = ins.rows[0]?.id;
    if (!id) throw new Error('Failed to insert ledger transaction');
    return { id };
  }

  async updateLedgerStatus(
    id: string,
    status: 'Pending' | 'Approved' | 'Paid',
  ): Promise<void> {
    const q = isUuid(id)
      ? this.db.query(
          `UPDATE transactions SET status = $1, "updatedAt" = now() WHERE id = $2::uuid`,
          [status, id],
        )
      : this.db.query(
          `UPDATE transactions SET status = $1, "updatedAt" = now() WHERE legacy_id = $2`,
          [status, id],
        );
    const result = await q;
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException(`Ledger transaction not found: ${id}`);
    }
  }

  /** Commission rows for Finance / Tribe (table `payout_transactions`). */
  async listPayouts(): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<{
      id: string;
      beneficiaryId: string;
      beneficiaryName: string | null;
      sourceMemberId: string | null;
      sourceMemberName: string | null;
      productId: string | null;
      productName: string | null;
      amount: string;
      status: string;
      createdAt: Date;
      paidAt: Date | null;
    }>(
      `SELECT id::text AS id, "beneficiaryId", "beneficiaryName", "sourceMemberId", "sourceMemberName",
              "productId", "productName", amount::float AS amount, status, "createdAt", "paidAt"
       FROM payout_transactions
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      sourceTransactionId: r.productId ?? '',
      sourceMemberName: r.sourceMemberName ?? '',
      productName: r.productName ?? '',
      beneficiaryId: r.beneficiaryId,
      amount: Number(r.amount),
      ruleApplied: r.beneficiaryName?.trim() || 'Commission',
      status: String(r.status ?? 'PENDING').toUpperCase(),
      createdAt: toIso(r.createdAt),
      paidAt: r.paidAt ? toIso(r.paidAt) : undefined,
    }));
  }

  async updatePayoutStatus(id: string, status: string): Promise<void> {
    const res = await this.db.query(
      `UPDATE payout_transactions
       SET status = $1,
           "paidAt" = CASE WHEN $1 = 'PAID' THEN now() ELSE "paidAt" END
       WHERE id = $2::uuid`,
      [status, id],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new NotFoundException(`Payout not found: ${id}`);
    }
  }

  /** Mark gateway payment as fully received (Finance AR settlement). */
  async settlePaymentTransaction(id: string): Promise<void> {
    const res = await this.db.query<{ customerEmail: string | null }>(
      `UPDATE payment_transactions
       SET status = 'PAID', "paidAmount" = "totalAmount", "balanceDue" = 0
       WHERE id = $1::uuid
       RETURNING "customerEmail"`,
      [id],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new NotFoundException(`Payment transaction not found: ${id}`);
    }
    const email = res.rows[0]?.customerEmail?.trim();
    if (email) {
      void this.members.promoteLifecycleAtLeastByEmail(email, 'MEMBER');
    }
  }

  /** Record a refund / overpayment adjustment on `payment_transactions`. */
  async recordPaymentRefund(
    id: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const q = await this.db.query<{
      totalAmount: string;
      paidAmount: string;
      status: string;
      refunds: unknown;
    }>(
      `SELECT "totalAmount", "paidAmount", status, refunds FROM payment_transactions WHERE id = $1::uuid`,
      [id],
    );
    const row = q.rows[0];
    if (!row) {
      throw new NotFoundException(`Payment transaction not found: ${id}`);
    }

    const total = Number(row.totalAmount);
    const paid = Number(row.paidAmount);
    const refundsArr = parseJson<unknown[]>(row.refunds, []);
    const list = Array.isArray(refundsArr) ? [...refundsArr] : [];
    list.push({
      id: `REF-${Date.now()}`,
      amount,
      reason,
      processedAt: new Date().toISOString(),
      status: 'PROCESSED',
    });

    let nextPaid = paid - amount;
    let nextStatus = row.status;
    if (paid > total) {
      const overage = paid - total;
      if (amount >= overage) {
        nextPaid = total;
        nextStatus = 'PAID';
      }
    }

    await this.db.query(
      `UPDATE payment_transactions
       SET refunds = $2::jsonb, "paidAmount" = $3, status = $4
       WHERE id = $1::uuid`,
      [id, JSON.stringify(list), nextPaid, nextStatus],
    );
  }

  /**
   * Finance Forecast tab: aggregates `payment_transactions`, `transactions`, `payout_transactions`.
   * No separate forecast table — derived from the same ledger the FE uses.
   */
  async getFinanceForecastSummary(): Promise<{
    outstandingAr: number;
    pendingApAmount: number;
    pendingApCount: number;
    commissionAccrued: number;
    commissionPendingCount: number;
    commissionBeneficiaryCount: number;
    paidRevenueMomPercent: number | null;
    netCashflowSixMonths: number;
    cashflowByMonth: Array<{
      month: string;
      monthLabel: string;
      rev: number;
      exp: number;
    }>;
  }> {
    const [arRes, apRes, commRes, momRes, cfRes] = await Promise.all([
      this.db.query<{ v: string }>(
        `SELECT COALESCE(SUM("balanceDue"), 0)::text AS v FROM payment_transactions`,
      ),
      this.db.query<{ s: string; c: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS s, COUNT(*)::text AS c
         FROM transactions
         WHERE LOWER(TRIM(status)) <> 'paid'
           AND type IN ('Expense', 'PO')`,
      ),
      this.db.query<{ s: string; c: string; b: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS s,
                COUNT(*)::text AS c,
                COUNT(DISTINCT "beneficiaryId")::text AS b
         FROM payout_transactions
         WHERE UPPER(TRIM(status)) = 'PENDING'`,
      ),
      this.db.query<{ curr: string; prev: string }>(
        `SELECT
           COALESCE(SUM("totalAmount") FILTER (
             WHERE date_trunc('month', "createdAt") = date_trunc('month', CURRENT_TIMESTAMP)
           ), 0)::text AS curr,
           COALESCE(SUM("totalAmount") FILTER (
             WHERE date_trunc('month', "createdAt") = date_trunc('month', CURRENT_TIMESTAMP - interval '1 month')
           ), 0)::text AS prev
         FROM payment_transactions
         WHERE status = 'PAID'`,
      ),
      this.db.query<{ m: Date; rev: string; exp: string }>(
        `WITH bounds AS (
           SELECT date_trunc('month', CURRENT_DATE)::date AS start_m
         ),
         months AS (
           SELECT gs::date AS m
           FROM bounds,
           generate_series(
             (SELECT start_m FROM bounds) - interval '5 months',
             (SELECT start_m FROM bounds),
             interval '1 month'
           ) AS gs
         )
         SELECT
           months.m,
           (
             SELECT COALESCE(SUM("totalAmount"), 0)::text
             FROM payment_transactions
             WHERE status = 'PAID'
               AND date_trunc('month', "createdAt")::date = months.m
           ) AS rev,
           (
             COALESCE(
               (
                 SELECT SUM(amount)
                 FROM transactions
                 WHERE LOWER(TRIM(status)) = 'paid'
                   AND type = 'Expense'
                   AND date_trunc('month', date::timestamp)::date = months.m
               ),
               0
             )
             +
             COALESCE(
               (
                 SELECT SUM(amount)
                 FROM payout_transactions
                 WHERE UPPER(TRIM(status)) = 'PAID'
                   AND "paidAt" IS NOT NULL
                   AND date_trunc('month', "paidAt")::date = months.m
               ),
               0
             )
           )::text AS exp
         FROM months
         ORDER BY months.m`,
      ),
    ]);

    const outstandingAr = Number(arRes.rows[0]?.v ?? 0);
    const pendingApAmount = Number(apRes.rows[0]?.s ?? 0);
    const pendingApCount = Number(apRes.rows[0]?.c ?? 0);
    const commissionAccrued = Number(commRes.rows[0]?.s ?? 0);
    const commissionPendingCount = Number(commRes.rows[0]?.c ?? 0);
    const commissionBeneficiaryCount = Number(commRes.rows[0]?.b ?? 0);

    const curr = Number(momRes.rows[0]?.curr ?? 0);
    const prev = Number(momRes.rows[0]?.prev ?? 0);
    let paidRevenueMomPercent: number | null = null;
    if (prev > 0) {
      paidRevenueMomPercent = ((curr - prev) / prev) * 100;
    } else if (curr > 0) {
      paidRevenueMomPercent = 100;
    }

    const cashflowByMonth = cfRes.rows.map((row) => {
      const m = row.m instanceof Date ? row.m : new Date(String(row.m));
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = m.toLocaleString('en-US', { month: 'short' });
      return {
        month,
        monthLabel,
        rev: Number(row.rev ?? 0),
        exp: Number(row.exp ?? 0),
      };
    });

    const netCashflowSixMonths = cashflowByMonth.reduce(
      (acc, row) => acc + (row.rev - row.exp),
      0,
    );

    return {
      outstandingAr,
      pendingApAmount,
      pendingApCount,
      commissionAccrued,
      commissionPendingCount,
      commissionBeneficiaryCount,
      paidRevenueMomPercent,
      netCashflowSixMonths,
      cashflowByMonth,
    };
  }

  // --- ops_templates / ops_checklists (db.sql; tasks jsonb holds FE payload) ---

  async listOpsTemplates(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, description, tasks, "createdAt"
       FROM ops_templates
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => this.rowToOpsTemplate(r));
  }

  private rowToOpsTemplate(row: Record<string, unknown>): unknown {
    const payload = parseJson<Record<string, unknown>>(row.tasks, {});
    const feId =
      typeof payload.feId === 'string' ? payload.feId : String(row.id ?? '');
    return {
      id: feId,
      name: String(row.name ?? ''),
      description:
        row.description != null
          ? String(row.description)
          : String(payload.description ?? ''),
      triggerType: payload.triggerType ?? 'PRODUCT_PURCHASE',
      triggerEventId: payload.triggerEventId,
      triggerProductId: payload.triggerProductId ?? 'ALL',
      items: Array.isArray(payload.items) ? payload.items : [],
      isActive: payload.isActive !== false,
    };
  }

  async upsertOpsTemplate(feIdFromUrl: string, body: Record<string, unknown>) {
    const template: Record<string, unknown> = {
      ...body,
      id: body.id ?? feIdFromUrl,
    };
    const feId = String(template.id ?? feIdFromUrl);
    const rowId = resolveOpsRowId(feId, 'tpl');
    const name = String(template.name ?? '');
    const description =
      template.description != null ? String(template.description) : '';
    const tasksPayload = {
      feId,
      triggerType: template.triggerType ?? 'PRODUCT_PURCHASE',
      triggerEventId: template.triggerEventId,
      triggerProductId: template.triggerProductId ?? 'ALL',
      isActive: template.isActive !== false,
      items: Array.isArray(template.items) ? template.items : [],
    };

    await this.db.query(
      `INSERT INTO ops_templates (id, name, description, tasks)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         tasks = EXCLUDED.tasks`,
      [rowId, name, description, JSON.stringify(tasksPayload)],
    );
  }

  async deleteOpsTemplate(feId: string): Promise<void> {
    const rowId = resolveOpsRowId(feId, 'tpl');
    await this.db.query(
      `DELETE FROM ops_templates WHERE id = $1::uuid OR tasks->>'feId' = $2`,
      [rowId, feId],
    );
  }

  async listOpsChecklists(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, description, tasks, "createdAt"
       FROM ops_checklists
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => this.rowToOpsChecklist(r));
  }

  private rowToOpsChecklist(row: Record<string, unknown>): unknown {
    const payload = parseJson<Record<string, unknown>>(row.tasks, {});
    const feId =
      typeof payload.feId === 'string' ? payload.feId : String(row.id ?? '');
    const taskList = Array.isArray(payload.tasks) ? payload.tasks : [];
    return {
      id: feId,
      templateId: String(payload.templateId ?? ''),
      transactionId: String(payload.transactionId ?? ''),
      memberId: String(payload.memberId ?? ''),
      memberName: String(payload.memberName ?? row.name ?? ''),
      productName: String(payload.productName ?? row.description ?? ''),
      status: payload.status ?? 'ACTIVE',
      progress: Number(payload.progress ?? 0),
      createdAt: toIso(payload.createdAt ?? row.createdAt),
      updatedAt: toIso(payload.updatedAt ?? payload.createdAt ?? row.createdAt),
      tasks: taskList,
    };
  }

  async getOpsChecklistByFeId(feId: string): Promise<unknown> {
    const rowId = resolveOpsRowId(feId, 'chk');
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, description, tasks, "createdAt"
       FROM ops_checklists
       WHERE id = $1::uuid OR tasks->>'feId' = $2
       LIMIT 1`,
      [rowId, feId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Checklist not found');
    }
    return this.rowToOpsChecklist(row);
  }

  async upsertOpsChecklist(feIdFromUrl: string, body: Record<string, unknown>) {
    const checklist: Record<string, unknown> = {
      ...body,
      id: body.id ?? feIdFromUrl,
    };
    const feId = String(checklist.id ?? feIdFromUrl);
    const rowId = resolveOpsRowId(feId, 'chk');
    const name = String(
      checklist.memberName ?? checklist.productName ?? 'Checklist',
    );
    const description = String(checklist.productName ?? '');
    const tasksPayload = {
      feId,
      templateId: checklist.templateId,
      transactionId: checklist.transactionId,
      memberId: checklist.memberId,
      memberName: checklist.memberName,
      productName: checklist.productName,
      status: checklist.status ?? 'ACTIVE',
      progress: checklist.progress ?? 0,
      createdAt: checklist.createdAt,
      updatedAt: checklist.updatedAt,
      tasks: Array.isArray(checklist.tasks) ? checklist.tasks : [],
    };
    const createdAt =
      checklist.createdAt != null
        ? new Date(String(checklist.createdAt))
        : new Date();

    await this.db.query(
      `INSERT INTO ops_checklists (id, name, description, tasks, "createdAt")
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         tasks = EXCLUDED.tasks`,
      [rowId, name, description, JSON.stringify(tasksPayload), createdAt],
    );
  }

  // --- support_tickets (FE: GET/POST/PATCH /fe/store/support-tickets) ---

  private rowToSupportTicket(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      id: String(row.id),
      memberId: String(row.memberId ?? row.memberid),
      memberName: String(row.memberName ?? row.membername),
      subject: String(row.subject),
      description: String(row.description),
      priority: String(row.priority),
      status: String(row.status),
      assignedRole: String(row.assignedRole ?? row.assignedrole),
      createdAt: toIso(row.createdAt ?? row.createdat),
      updatedAt: toIso(row.updatedAt ?? row.updatedat),
    };
  }

  async listSupportTickets(): Promise<unknown[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id::text AS id, "memberId", "memberName", subject, description, priority, status,
              "assignedRole", "createdAt", "updatedAt"
       FROM support_tickets
       ORDER BY "updatedAt" DESC`,
    );
    return result.rows.map((r) => this.rowToSupportTicket(r));
  }

  async createSupportTicket(body: Record<string, unknown>): Promise<unknown> {
    const memberId = String(body.memberId ?? '');
    const memberName = String(body.memberName ?? '');
    const subject = String(body.subject ?? '');
    const description = String(body.description ?? '');
    const priority = String(body.priority ?? 'MEDIUM');
    const status = String(body.status ?? 'NEW');
    const assignedRole = String(body.assignedRole ?? 'OPERATIONS');

    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO support_tickets (
        "memberId", "memberName", subject, description, priority, status, "assignedRole", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id::text AS id, "memberId", "memberName", subject, description, priority, status,
                "assignedRole", "createdAt", "updatedAt"`,
      [
        memberId,
        memberName,
        subject,
        description,
        priority,
        status,
        assignedRole,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Failed to create support ticket');
    }
    return this.rowToSupportTicket(row);
  }

  async updateSupportTicket(
    id: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const pairs: Array<[string, unknown]> = [];
    if (body.memberId !== undefined) pairs.push(['memberId', body.memberId]);
    if (body.memberName !== undefined)
      pairs.push(['memberName', body.memberName]);
    if (body.subject !== undefined) pairs.push(['subject', body.subject]);
    if (body.description !== undefined)
      pairs.push(['description', body.description]);
    if (body.priority !== undefined) pairs.push(['priority', body.priority]);
    if (body.status !== undefined) pairs.push(['status', body.status]);
    if (body.assignedRole !== undefined)
      pairs.push(['assignedRole', body.assignedRole]);

    if (pairs.length === 0) return;

    const setClauses = pairs
      .map(([col], i) => `"${col}" = $${i + 1}`)
      .concat(['"updatedAt" = NOW()']);
    const values = pairs.map(([, v]) => v);
    const idParam = values.length + 1;
    values.push(id);

    await this.db.query(
      `UPDATE support_tickets SET ${setClauses.join(', ')} WHERE id = $${idParam}::uuid`,
      values,
    );
  }

  async resolveSupportTicket(id: string, resolution: string): Promise<void> {
    const found = await this.db.query<{ description: string }>(
      `SELECT description FROM support_tickets WHERE id = $1::uuid`,
      [id],
    );
    const row = found.rows[0];
    if (!row) {
      throw new NotFoundException('Support ticket not found');
    }
    const prev = String(row.description ?? '');
    const next =
      resolution && resolution.trim().length > 0
        ? `${prev}\n\n--- Resolution ---\n${resolution.trim()}`
        : prev;

    await this.db.query(
      `UPDATE support_tickets
       SET description = $2, status = 'RESOLVED', "updatedAt" = NOW()
       WHERE id = $1::uuid`,
      [id, next],
    );
  }
}
