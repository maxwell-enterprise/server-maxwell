/**
 * MAXWELL ERP - Wallet Service
 * Manages user's digital assets (tickets, credits, passes)
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  MemberWallet,
  WalletTransaction,
  GiftAllocation,
  MembershipCard,
} from './entities';
import {
  WalletQueryDto,
  CreateGiftDto,
  ClaimGiftDto,
  RevokeGiftDto,
  WalletHistoryQueryDto,
} from './dto';
import { DbService } from '../../common/db.service';

@Injectable()
export class WalletService {
  constructor(private readonly db: DbService) {}
  // ==========================================================================
  // WALLET ITEMS
  // ==========================================================================

  /**
   * Get user's wallet items
   */
  async getMyWallet(
    userId: string,
    query: WalletQueryDto,
  ): Promise<MemberWallet[]> {
    const params: any[] = [userId];
    const where: string[] = ['"userId" = $1'];

    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }

    const result = await this.db.query<MemberWallet>(
      `
      select
        id,
        "userId",
        meta->>'tagId' as "tagId",
        coalesce((meta->>'initialBalance')::int, 1) as "initialBalance",
        coalesce((meta->>'balance')::int, 1) as balance,
        status,
        "qrData" as "uniqueQrString",
        coalesce("createdAt", now()) as "qrGeneratedAt",
        coalesce("createdAt", now()) as "validFrom",
        "expiryDate" as "validUntil",
        coalesce(meta->>'sourceType', 'UNKNOWN') as "sourceType",
        meta->>'sourceTransactionId' as "sourceTransactionId",
        meta->>'sponsorUserId' as "sponsorUserId",
        false as "isGift",
        null::timestamptz as "lockedAt",
        null::text as "lockedReason",
        subtitle as notes,
        meta as metadata,
        coalesce("createdAt", now()) as "createdAt",
        coalesce("createdAt", now()) as "updatedAt"
      from wallet_items
      where ${where.join(' and ')}
      order by "createdAt" desc
      `,
      params,
    );
    return result.rows;
  }

  /**
   * Get single wallet item
   */
  async getWalletItem(id: string, userId: string): Promise<MemberWallet> {
    const result = await this.db.query<MemberWallet>(
      `
      select
        id,
        "userId",
        meta->>'tagId' as "tagId",
        coalesce((meta->>'initialBalance')::int, 1) as "initialBalance",
        coalesce((meta->>'balance')::int, 1) as balance,
        status,
        "qrData" as "uniqueQrString",
        coalesce("createdAt", now()) as "qrGeneratedAt",
        coalesce("createdAt", now()) as "validFrom",
        "expiryDate" as "validUntil",
        coalesce(meta->>'sourceType', 'UNKNOWN') as "sourceType",
        meta->>'sourceTransactionId' as "sourceTransactionId",
        meta->>'sponsorUserId' as "sponsorUserId",
        false as "isGift",
        null::timestamptz as "lockedAt",
        null::text as "lockedReason",
        subtitle as notes,
        meta as metadata,
        coalesce("createdAt", now()) as "createdAt",
        coalesce("createdAt", now()) as "updatedAt"
      from wallet_items
      where id = $1 and "userId" = $2
      `,
      [id, userId],
    );
    const wallet = result.rows[0];
    if (!wallet) {
      throw new NotFoundException(`Wallet item ${id} not found`);
    }
    return wallet;
  }

  /**
   * Get wallet item by QR string (for scanning)
   */
  async getWalletByQr(qrString: string): Promise<MemberWallet | null> {
    const result = await this.db.query<MemberWallet>(
      `
      select
        id,
        "userId",
        meta->>'tagId' as "tagId",
        coalesce((meta->>'initialBalance')::int, 1) as "initialBalance",
        coalesce((meta->>'balance')::int, 1) as balance,
        status,
        "qrData" as "uniqueQrString",
        coalesce("createdAt", now()) as "qrGeneratedAt",
        coalesce("createdAt", now()) as "validFrom",
        "expiryDate" as "validUntil",
        coalesce(meta->>'sourceType', 'UNKNOWN') as "sourceType",
        meta->>'sourceTransactionId' as "sourceTransactionId",
        meta->>'sponsorUserId' as "sponsorUserId",
        false as "isGift",
        null::timestamptz as "lockedAt",
        null::text as "lockedReason",
        subtitle as notes,
        meta as metadata,
        coalesce("createdAt", now()) as "createdAt",
        coalesce("createdAt", now()) as "updatedAt"
      from wallet_items
      where "qrData" = $1
      `,
      [qrString],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Create wallet item (internal - called after payment)
   */
  async createWalletItem(data: {
    userId: string;
    tagId: string;
    balance: number;
    sourceType: string;
    sourceTransactionId?: string;
    sponsorUserId?: string;
    validUntil?: Date;
  }): Promise<MemberWallet> {
    const qrString = `WALLET-${crypto.randomUUID()}`;
    const meta = {
      tagId: data.tagId,
      initialBalance: data.balance,
      balance: data.balance,
      sourceType: data.sourceType,
      sourceTransactionId: data.sourceTransactionId,
      sponsorUserId: data.sponsorUserId,
    };

    const result = await this.db.query<MemberWallet>(
      `
      insert into wallet_items (
        "userId",
        type,
        title,
        subtitle,
        "expiryDate",
        "qrData",
        status,
        meta,
        "createdAt"
      )
      values (
        $1,
        'TICKET',
        'Entitlement',
        null,
        $2,
        $3,
        'ACTIVE',
        $4::jsonb,
        now()
      )
      returning id,
        "userId",
        meta->>'tagId' as "tagId",
        (meta->>'initialBalance')::int as "initialBalance",
        (meta->>'balance')::int as balance,
        status,
        "qrData" as "uniqueQrString",
        "createdAt" as "qrGeneratedAt",
        "createdAt" as "validFrom",
        "expiryDate" as "validUntil",
        meta->>'sourceType' as "sourceType",
        meta->>'sourceTransactionId' as "sourceTransactionId",
        meta->>'sponsorUserId' as "sponsorUserId",
        false as "isGift",
        null::timestamptz as "lockedAt",
        null::text as "lockedReason",
        subtitle as notes,
        meta as metadata,
        "createdAt" as "createdAt",
        "createdAt" as "updatedAt"
      `,
      [data.userId, data.validUntil ?? null, qrString, JSON.stringify(meta)],
    );

    return result.rows[0];
  }

  /**
   * Use wallet credit (for check-in)
   */
  async useCredit(
    walletId: string,
    amount: number,
    eventId: string,
    performedBy: string,
  ): Promise<MemberWallet> {
    const client = await this.db.getClient();
    try {
      await client.query('begin');
      const res = await client.query<MemberWallet>(
        `
        select
          id,
          "userId",
          meta->>'tagId' as "tagId",
          (meta->>'initialBalance')::int as "initialBalance",
          (meta->>'balance')::int as balance,
          status,
          "qrData" as "uniqueQrString",
          "createdAt" as "qrGeneratedAt",
          "createdAt" as "validFrom",
          "expiryDate" as "validUntil",
          meta->>'sourceType' as "sourceType",
          meta->>'sourceTransactionId' as "sourceTransactionId",
          meta->>'sponsorUserId' as "sponsorUserId",
          false as "isGift",
          null::timestamptz as "lockedAt",
          null::text as "lockedReason",
          subtitle as notes,
          meta as metadata,
          "createdAt" as "createdAt",
          "createdAt" as "updatedAt"
        from wallet_items
        where id = $1
        for update
        `,
        [walletId],
      );
      const wallet = res.rows[0];
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      if (wallet.balance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const newBalance = wallet.balance - amount;
      const newMeta = {
        ...(wallet.metadata || {}),
        balance: newBalance,
        initialBalance: wallet.initialBalance,
        tagId: (wallet as any).tagId,
      };

      await client.query(
        `
        update wallet_items
        set meta = $2::jsonb
        where id = $1
        `,
        [walletId, JSON.stringify(newMeta)],
      );

      await client.query(
        `
        insert into wallet_transactions (
          id, "walletItemId", "userId", "transactionType",
          "amountChange", "balanceAfter", "referenceId", "referenceName",
          timestamp
        )
        values (
          gen_random_uuid(), $1, $2, 'USAGE',
          $3 * -1, $4, $5, $6, now()
        )
        `,
        [walletId, wallet.userId, amount, newBalance, eventId, 'Check-in'],
      );

      await client.query('commit');
      return { ...wallet, balance: newBalance };
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // WALLET TRANSACTIONS (History)
  // ==========================================================================

  /**
   * Get wallet transaction history
   */
  async getHistory(
    userId: string,
    query: WalletHistoryQueryDto,
  ): Promise<{ data: WalletTransaction[]; total: number }> {
    const { page, limit } = query;

    const baseSql = `
      select wt.*
      from wallet_transactions wt
      join wallet_items wi on wi.id = wt."walletItemId"
      where wi."userId" = $1
      order by wt.timestamp desc
    `;

    const { rows, total } = await this.db.paginatedQuery<WalletTransaction>(
      baseSql,
      [userId],
      page,
      limit,
    );

    return { data: rows, total };
  }

  /**
   * Create transaction log (internal)
   */
  async logTransaction(data: {
    walletId: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceType?: string;
    referenceId?: string;
    eventId?: string;
    relatedUserId?: string;
    notes?: string;
    performedBy?: string;
  }): Promise<WalletTransaction> {
    const result = await this.db.query<WalletTransaction>(
      `
      insert into wallet_transactions (
        id, "walletItemId", "userId", "transactionType",
        "amountChange", "balanceAfter", "referenceId", "referenceName",
        timestamp
      )
      values (
        gen_random_uuid(), $1, $2, $3,
        $4, $5, $6, $7, now()
      )
      returning *
      `,
      [
        data.walletId,
        data.referenceId ?? null,
        data.type,
        data.amount,
        data.balanceAfter,
        data.referenceId ?? null,
        data.notes ?? null,
      ],
    );
    return result.rows[0];
  }

  // ==========================================================================
  // GIFT / TRANSFER
  // ==========================================================================

  /**
   * Create a gift allocation (send ticket to someone)
   */
  async createGift(
    senderId: string,
    dto: CreateGiftDto,
  ): Promise<GiftAllocation> {
    // 1. Get wallet item, verify ownership
    const wallet = await this.getWalletItem(dto.walletItemId, senderId);

    // 2. Verify sufficient balance
    if (wallet.balance < dto.transferAmount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 3. Verify wallet is not already locked
    if (wallet.status === 'LOCKED') {
      throw new BadRequestException(
        'Wallet item is already locked for transfer',
      );
    }

    // TODO: Begin atomic transaction
    // 4. Lock the wallet item
    // 5. Create gift_allocation with token
    // 6. Log wallet_transaction (TRANSFER_OUT pending)
    // 7. Send notification (email/whatsapp/link)
    // TODO: Commit transaction

    throw new Error('Not implemented - needs database');
  }

  /**
   * Claim a gift (receive transferred ticket)
   */
  async claimGift(
    recipientId: string,
    dto: ClaimGiftDto,
  ): Promise<MemberWallet> {
    // 1. Find gift by token
    const gift = await this.findGiftByToken(dto.token);
    if (!gift) {
      throw new NotFoundException('Invalid or expired gift token');
    }

    // 2. Verify not expired
    if (new Date() > gift.tokenExpiresAt) {
      throw new BadRequestException('Gift link has expired');
    }

    // 3. Verify not already claimed/revoked
    if (gift.status !== 'PENDING') {
      throw new BadRequestException(
        `Gift is already ${gift.status.toLowerCase()}`,
      );
    }

    // TODO: Begin atomic transaction
    // 4. Deduct from sender's wallet
    // 5. Create new wallet item for recipient
    // 6. Update gift status to CLAIMED
    // 7. Log wallet_transactions (TRANSFER_OUT for sender, TRANSFER_IN for recipient)
    // TODO: Commit transaction

    throw new Error('Not implemented - needs database');
  }

  /**
   * Revoke a pending gift
   */
  async revokeGift(
    senderId: string,
    giftId: string,
    dto: RevokeGiftDto,
  ): Promise<GiftAllocation> {
    // 1. Find gift
    const gift = await this.findGiftById(giftId);
    if (!gift) {
      throw new NotFoundException('Gift not found');
    }

    // 2. Verify sender owns this gift
    if (gift.senderUserId !== senderId) {
      throw new ForbiddenException('You can only revoke your own gifts');
    }

    // 3. Verify still pending
    if (gift.status !== 'PENDING') {
      throw new BadRequestException('Can only revoke pending gifts');
    }

    // TODO: Begin transaction
    // 4. Unlock the wallet item
    // 5. Update gift status to REVOKED
    // TODO: Commit transaction

    throw new Error('Not implemented - needs database');
  }

  /**
   * Get user's sent gifts
   */
  async getSentGifts(userId: string): Promise<GiftAllocation[]> {
    const res = await this.db.query<GiftAllocation>(
      `
      select *
      from gift_allocations
      where "sourceUserId" = $1
      order by "createdAt" desc
      `,
      [userId],
    );
    return res.rows;
  }

  /**
   * Get user's received gifts
   */
  async getReceivedGifts(userId: string): Promise<GiftAllocation[]> {
    const res = await this.db.query<GiftAllocation>(
      `
      select *
      from gift_allocations
      where "claimedByUserId" = $1
      order by "createdAt" desc
      `,
      [userId],
    );
    return res.rows;
  }

  private async findGiftByToken(token: string): Promise<GiftAllocation | null> {
    const res = await this.db.query<GiftAllocation>(
      'select * from gift_allocations where "claimToken" = $1',
      [token],
    );
    return res.rows[0] ?? null;
  }

  private async findGiftById(id: string): Promise<GiftAllocation | null> {
    const res = await this.db.query<GiftAllocation>(
      'select * from gift_allocations where id = $1',
      [id],
    );
    return res.rows[0] ?? null;
  }

  // ==========================================================================
  // MEMBERSHIP CARD
  // ==========================================================================

  /**
   * Get or create membership card
   */
  async getMembershipCard(userId: string): Promise<MembershipCard> {
    const result = await this.db.query<MembershipCard>(
      `
      select *
      from membership_cards
      where "userId" = $1
      `,
      [userId],
    ).catch(() => ({ rows: [] as MembershipCard[] }));

    if (result.rows[0]) return result.rows[0];

    const cardNumber = `MX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const insert = await this.db
      .query<MembershipCard>(
        `
        insert into membership_cards (
          id, "userId", card_number, qr_string,
          membership_tier, tier_updated_at,
          valid_from, is_lifetime,
          card_design_template,
          total_events_attended,
          total_points_earned,
          is_active,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(), $1, $2, $3,
          'BRONZE', now(),
          now(), true,
          'default',
          0, 0, true, now(), now()
        )
        returning *
        `,
        [userId, cardNumber, cardNumber],
      )
      .catch(() => ({ rows: [] as MembershipCard[] }));

    return insert.rows[0];
  }

  /**
   * Update membership tier based on points/activity
   */
  async updateMembershipTier(userId: string): Promise<MembershipCard> {
    // Calculate new tier based on points
    // TODO: Update card
    throw new Error('Not implemented - needs database');
  }
}
