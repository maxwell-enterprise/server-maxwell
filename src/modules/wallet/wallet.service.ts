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
import { PoolClient } from 'pg';
import {
  MemberWallet,
  WalletItemContract,
  WalletTransaction,
  GiftAllocation,
  MembershipCard,
  UserEntitlementsContract,
  CorporateTeamMemberContract,
} from './entities';
import {
  WalletQueryDto,
  CreateGiftDto,
  ClaimGiftDto,
  RevokeGiftDto,
  WalletHistoryQueryDto,
} from './dto';
import { DbService } from '../../common/db.service';

type SqlExecutor = Pick<DbService, 'query'> | Pick<PoolClient, 'query'>;

interface WalletItemContractRow extends WalletItemContract {
  internalId: string;
}

interface WalletOwnerRow {
  internalId: string;
  userId: string;
}

interface WalletItemMutationInput {
  id: string;
  userId: string;
  type: string;
  title: string;
  subtitle?: string;
  expiryDate?: string | null;
  qrData?: string | null;
  status: string;
  isTransferable?: boolean;
  sponsoredBy?: string | null;
  meta?: Record<string, unknown>;
}

interface GiftAllocationRow extends GiftAllocation {
  internalId: string;
}

interface WalletTransactionRow extends WalletTransaction {
  internalId: string;
}

interface TeamMemberRow extends CorporateTeamMemberContract {
  internalId: string;
}

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
      where (id::text = $1 or public_id = $1) and "userId" = $2
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
    const publicId = this.buildWalletPublicId();
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
        public_id,
        "userId",
        type,
        title,
        subtitle,
        "expiryDate",
        "qrData",
        status,
        meta,
        "createdAt",
        "updatedAt"
      )
      values (
        $1,
        $2,
        'TICKET',
        'Entitlement',
        null,
        $3,
        $4,
        'ACTIVE',
        $5::jsonb,
        now(),
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
      [
        publicId,
        data.userId,
        data.validUntil ?? null,
        qrString,
        JSON.stringify(meta),
      ],
    );

    return result.rows[0];
  }

  async issueInvitationTicket(
    data: {
      userId: string;
      eventId: string;
      eventName: string;
      eventDate?: string | Date | null;
      location?: string | null;
      invitationId: string;
      tierId?: string | null;
      tierName?: string | null;
      sponsoredBy?: string | null;
    },
    executor: SqlExecutor = this.db,
  ): Promise<WalletItemContract> {
    const publicId = this.buildWalletPublicId('TKT-INV');
    const qrData = `TICKET:${data.eventId}:${data.userId}:${publicId}`;
    const meta = {
      eventId: data.eventId,
      location: data.location ?? null,
      targetTier: data.tierId ?? 'VIP',
      invitationId: data.invitationId,
    };

    const result = await executor.query<WalletItemContractRow>(
      `
      insert into wallet_items (
        public_id,
        "userId",
        type,
        title,
        subtitle,
        "expiryDate",
        "qrData",
        status,
        "isTransferable",
        "sponsoredBy",
        meta,
        "createdAt",
        "updatedAt"
      )
      values (
        $1,
        $2,
        'TICKET',
        $3,
        $4,
        $5::timestamptz,
        $6,
        'ACTIVE',
        false,
        $7,
        $8::jsonb,
        now(),
        now()
      )
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        "userId",
        type,
        title,
        coalesce(subtitle, '') as subtitle,
        "expiryDate" as "expiryDate",
        "qrData" as "qrData",
        status,
        coalesce("isTransferable", false) as "isTransferable",
        "sponsoredBy" as "sponsoredBy",
        coalesce(meta, '{}'::jsonb) as meta,
        "createdAt" as "createdAt",
        coalesce("updatedAt", "createdAt", now()) as "updatedAt"
      `,
      [
        publicId,
        data.userId,
        data.eventName,
        data.tierName ?? 'Invited Guest',
        this.toNullableTimestamp(data.eventDate),
        qrData,
        data.sponsoredBy ?? null,
        JSON.stringify(meta),
      ],
    );

    const created = result.rows[0];
    await this.insertWalletTransaction(
      {
        walletItemId: created.internalId,
        userId: data.userId,
        transactionType: 'TRANSFER_IN',
        amountChange: 1,
        balanceAfter: 1,
        referenceId: data.invitationId,
        referenceName: `Invitation Accepted: ${data.eventName}`,
      },
      executor,
    );

    const { internalId, ...walletItem } = created;
    return walletItem;
  }

  async getUserEntitlements(
    userId: string,
  ): Promise<UserEntitlementsContract | null> {
    const result = await this.db.query<UserEntitlementsContract>(
      `
      select
        "userId",
        permissions,
        attributes,
        credits::float8 as credits
      from user_entitlements
      where "userId" = $1
      limit 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async upsertUserEntitlements(
    entitlements: UserEntitlementsContract,
  ): Promise<UserEntitlementsContract> {
    const result = await this.db.query<UserEntitlementsContract>(
      `
      insert into user_entitlements (
        "userId",
        permissions,
        attributes,
        credits
      )
      values (
        $1,
        $2::text[],
        $3::jsonb,
        $4
      )
      on conflict ("userId") do update
      set permissions = excluded.permissions,
          attributes = excluded.attributes,
          credits = excluded.credits
      returning
        "userId",
        permissions,
        attributes,
        credits::float8 as credits
      `,
      [
        entitlements.userId,
        entitlements.permissions,
        JSON.stringify(entitlements.attributes ?? {}),
        entitlements.credits,
      ],
    );

    return result.rows[0];
  }

  async getWalletItemsForUser(
    userId: string,
    status?: string,
  ): Promise<WalletItemContract[]> {
    const params: unknown[] = [userId];
    const where: string[] = ['wi."userId" = $1'];

    if (status?.trim()) {
      params.push(status.trim());
      where.push(`wi.status = $${params.length}`);
    }

    return this.selectWalletItems(
      `where ${where.join(' and ')} order by wi."createdAt" desc`,
      params,
    );
  }

  async getAllWalletItems(): Promise<WalletItemContract[]> {
    return this.selectWalletItems('order by wi."createdAt" desc');
  }

  async getWalletItemContractById(
    identifier: string,
  ): Promise<WalletItemContract | null> {
    const items = await this.selectWalletItems(
      'where wi.public_id = $1 or wi.id::text = $1 limit 1',
      [identifier.trim()],
    );
    return items[0] ?? null;
  }

  async upsertWalletItem(
    item: WalletItemMutationInput,
    executor: SqlExecutor = this.db,
  ): Promise<WalletItemContract> {
    const publicId = item.id.trim();
    const result = await executor.query<WalletItemContractRow>(
      `
      insert into wallet_items (
        public_id,
        "userId",
        type,
        title,
        subtitle,
        "expiryDate",
        "qrData",
        status,
        "isTransferable",
        "sponsoredBy",
        meta,
        "createdAt",
        "updatedAt"
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::timestamptz,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        now(),
        now()
      )
      on conflict (public_id) do update
      set "userId" = excluded."userId",
          type = excluded.type,
          title = excluded.title,
          subtitle = excluded.subtitle,
          "expiryDate" = excluded."expiryDate",
          "qrData" = excluded."qrData",
          status = excluded.status,
          "isTransferable" = excluded."isTransferable",
          "sponsoredBy" = excluded."sponsoredBy",
          meta = excluded.meta,
          "updatedAt" = now()
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        "userId",
        type,
        title,
        coalesce(subtitle, '') as subtitle,
        "expiryDate" as "expiryDate",
        "qrData" as "qrData",
        status,
        coalesce("isTransferable", false) as "isTransferable",
        "sponsoredBy" as "sponsoredBy",
        coalesce(meta, '{}'::jsonb) as meta,
        "createdAt" as "createdAt",
        coalesce("updatedAt", "createdAt", now()) as "updatedAt"
      `,
      [
        publicId,
        item.userId,
        item.type,
        item.title,
        item.subtitle ?? '',
        this.toNullableTimestamp(item.expiryDate ?? null),
        item.qrData ?? null,
        item.status,
        item.isTransferable ?? false,
        item.sponsoredBy ?? null,
        JSON.stringify(item.meta ?? {}),
      ],
    );

    const { internalId, ...walletItem } = result.rows[0];
    return walletItem;
  }

  async upsertWalletItems(
    items: WalletItemMutationInput[],
  ): Promise<WalletItemContract[]> {
    return this.db.withTransaction(async (client) => {
      const results: WalletItemContract[] = [];
      for (const item of items) {
        results.push(await this.upsertWalletItem(item, client));
      }
      return results;
    });
  }

  async getWalletHistory(userId: string): Promise<WalletTransaction[]> {
    const result = await this.db.query<WalletTransaction>(
      `
      select
        coalesce(wt.public_id, wt.id::text) as id,
        coalesce(wi.public_id, wt."walletItemId"::text) as "walletItemId",
        wt."userId",
        wt."transactionType" as "transactionType",
        wt."amountChange"::float8 as "amountChange",
        wt."balanceAfter"::float8 as "balanceAfter",
        wt."referenceId" as "referenceId",
        wt."referenceName" as "referenceName",
        wt.timestamp as timestamp
      from wallet_transactions wt
      join wallet_items wi on wi.id = wt."walletItemId"
      where wt."userId" = $1
      order by wt.timestamp desc
      `,
      [userId],
    );

    return result.rows;
  }

  async logWalletHistory(
    data: {
      id?: string;
      walletItemId: string;
      userId: string;
      transactionType: string;
      amountChange: number;
      balanceAfter: number;
      referenceId?: string;
      referenceName?: string;
      timestamp?: string;
    },
    executor: SqlExecutor = this.db,
  ): Promise<WalletTransaction> {
    const wallet = await this.resolveWalletOwner(data.walletItemId, executor);

    return this.insertWalletTransaction(
      {
        publicId: data.id?.trim() || null,
        walletItemId: wallet.internalId,
        userId: data.userId,
        transactionType: data.transactionType,
        amountChange: data.amountChange,
        balanceAfter: data.balanceAfter,
        referenceId: data.referenceId ?? null,
        referenceName: data.referenceName ?? null,
        timestamp: data.timestamp ?? null,
      },
      executor,
    );
  }

  async getGiftAllocations(): Promise<GiftAllocation[]> {
    return this.selectGiftAllocations('order by ga."createdAt" desc');
  }

  async upsertGiftAllocation(
    gift: GiftAllocation,
    executor: SqlExecutor = this.db,
  ): Promise<GiftAllocation> {
    const wallet = await this.resolveWalletOwner(gift.entitlementId, executor);
    const result = await executor.query<GiftAllocationRow>(
      `
      insert into gift_allocations (
        public_id,
        "sourceUserId",
        "sourceUserName",
        "entitlementId",
        "itemName",
        "targetEmail",
        "claimToken",
        status,
        "claimedByUserId",
        "claimedAt",
        "createdAt"
      )
      values (
        $1,
        $2,
        $3,
        $4::uuid,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::timestamptz,
        $11::timestamptz
      )
      on conflict (public_id) do update
      set "sourceUserId" = excluded."sourceUserId",
          "sourceUserName" = excluded."sourceUserName",
          "entitlementId" = excluded."entitlementId",
          "itemName" = excluded."itemName",
          "targetEmail" = excluded."targetEmail",
          "claimToken" = excluded."claimToken",
          status = excluded.status,
          "claimedByUserId" = excluded."claimedByUserId",
          "claimedAt" = excluded."claimedAt"
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        "sourceUserId" as "sourceUserId",
        "sourceUserName" as "sourceUserName",
        $12::text as "entitlementId",
        "itemName" as "itemName",
        "targetEmail" as "targetEmail",
        "claimToken" as "claimToken",
        status,
        "claimedByUserId" as "claimedByUserId",
        "claimedAt" as "claimedAt",
        "createdAt" as "createdAt"
      `,
      [
        gift.id.trim(),
        gift.sourceUserId,
        gift.sourceUserName,
        wallet.internalId,
        gift.itemName,
        gift.targetEmail ?? null,
        gift.claimToken,
        gift.status,
        gift.claimedByUserId ?? null,
        this.toNullableTimestamp(gift.claimedAt ?? null),
        this.toNullableTimestamp(gift.createdAt ?? new Date().toISOString()),
        gift.entitlementId,
      ],
    );

    const { internalId, ...allocation } = result.rows[0];
    return allocation;
  }

  async getTeamMembers(orgId: string): Promise<CorporateTeamMemberContract[]> {
    const result = await this.db.query<CorporateTeamMemberContract>(
      `
      select
        coalesce(public_id, id::text) as id,
        "orgId" as "orgId",
        email,
        name,
        status,
        "joinedAt" as "joinedAt",
        "lastActive" as "lastActive"
      from corporate_members
      where "orgId" = $1
      order by name asc, email asc
      `,
      [orgId],
    );

    return result.rows;
  }

  async upsertTeamMember(
    member: CorporateTeamMemberContract & { orgId: string },
    executor: SqlExecutor = this.db,
  ): Promise<CorporateTeamMemberContract> {
    const result = await executor.query<TeamMemberRow>(
      `
      insert into corporate_members (
        public_id,
        "orgId",
        email,
        name,
        status,
        "joinedAt",
        "lastActive"
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::timestamptz,
        $7::timestamptz
      )
      on conflict (public_id) do update
      set "orgId" = excluded."orgId",
          email = excluded.email,
          name = excluded.name,
          status = excluded.status,
          "joinedAt" = excluded."joinedAt",
          "lastActive" = excluded."lastActive"
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        "orgId" as "orgId",
        email,
        name,
        status,
        "joinedAt" as "joinedAt",
        "lastActive" as "lastActive"
      `,
      [
        member.id.trim(),
        member.orgId,
        member.email,
        member.name,
        member.status,
        this.toNullableTimestamp(member.joinedAt ?? null),
        this.toNullableTimestamp(member.lastActive ?? null),
      ],
    );

    const { internalId, ...teamMember } = result.rows[0];
    return teamMember;
  }

  async deleteTeamMember(identifier: string): Promise<void> {
    await this.db.query(
      `
      delete from corporate_members
      where public_id = $1 or id::text = $1
      `,
      [identifier.trim()],
    );
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
    const params: unknown[] = [userId];
    const where: string[] = ['wi."userId" = $1'];

    if (query.type?.trim()) {
      params.push(query.type.trim());
      where.push(`wt."transactionType" = $${params.length}`);
    }

    if (query.startDate) {
      params.push(query.startDate.toISOString());
      where.push(`wt.timestamp >= $${params.length}::timestamptz`);
    }

    if (query.endDate) {
      params.push(query.endDate.toISOString());
      where.push(`wt.timestamp <= $${params.length}::timestamptz`);
    }

    const baseSql = `
      select wt.*
      from wallet_transactions wt
      join wallet_items wi on wi.id = wt."walletItemId"
      where ${where.join(' and ')}
      order by wt.timestamp desc
    `;

    const { rows, total } = await this.db.paginatedQuery<WalletTransaction>(
      baseSql,
      params,
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
    const wallet = await this.resolveWalletOwner(data.walletId);

    return this.insertWalletTransaction({
      walletItemId: wallet.internalId,
      userId: wallet.userId,
      transactionType: data.type,
      amountChange: data.amount,
      balanceAfter: data.balanceAfter,
      referenceId: data.referenceId ?? data.eventId ?? null,
      referenceName: data.notes ?? data.referenceType ?? null,
    });
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
    if (gift.tokenExpiresAt && new Date() > gift.tokenExpiresAt) {
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
    if ((gift.sourceUserId ?? gift.senderUserId) !== senderId) {
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
    return this.selectGiftAllocations(
      'where ga."sourceUserId" = $1 order by ga."createdAt" desc',
      [userId],
    );
  }

  /**
   * Get user's received gifts
   */
  async getReceivedGifts(userId: string): Promise<GiftAllocation[]> {
    return this.selectGiftAllocations(
      'where ga."claimedByUserId" = $1 order by ga."createdAt" desc',
      [userId],
    );
  }

  private async findGiftByToken(token: string): Promise<GiftAllocation | null> {
    const rows = await this.selectGiftAllocations(
      'where ga."claimToken" = $1 limit 1',
      [token],
    );
    return rows[0] ?? null;
  }

  private async findGiftById(id: string): Promise<GiftAllocation | null> {
    const rows = await this.selectGiftAllocations(
      'where ga.public_id = $1 or ga.id::text = $1 limit 1',
      [id],
    );
    return rows[0] ?? null;
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
      select
        id,
        user_id as "userId",
        card_number as "cardNumber",
        qr_string as "qrString",
        membership_tier as "membershipTier",
        tier_updated_at as "tierUpdatedAt",
        valid_from as "validFrom",
        valid_until as "validUntil",
        is_lifetime as "isLifetime",
        card_design_template as "cardDesignTemplate",
        custom_design_url as "customDesignUrl",
        total_events_attended as "totalEventsAttended",
        total_points_earned as "totalPointsEarned",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from membership_cards
      where user_id = $1
      `,
      [userId],
    ).catch(() => ({ rows: [] as MembershipCard[] }));

    if (result.rows[0]) return result.rows[0];

    const cardNumber = `MX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const insert = await this.db
      .query<MembershipCard>(
        `
        insert into membership_cards (
          id, user_id, card_number, qr_string,
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
          returning
            id,
            user_id as "userId",
            card_number as "cardNumber",
            qr_string as "qrString",
            membership_tier as "membershipTier",
            tier_updated_at as "tierUpdatedAt",
            valid_from as "validFrom",
            valid_until as "validUntil",
            is_lifetime as "isLifetime",
            card_design_template as "cardDesignTemplate",
            custom_design_url as "customDesignUrl",
            total_events_attended as "totalEventsAttended",
            total_points_earned as "totalPointsEarned",
            is_active as "isActive",
            created_at as "createdAt",
            updated_at as "updatedAt"
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

  private async resolveWalletOwner(
    identifier: string,
    executor: SqlExecutor = this.db,
  ): Promise<WalletOwnerRow> {
    const result = await executor.query<WalletOwnerRow>(
      `
      select
        id::text as "internalId",
        "userId"
      from wallet_items
      where id::text = $1 or public_id = $1
      limit 1
      `,
      [identifier],
    );

    const wallet = result.rows[0];
    if (!wallet) {
      throw new NotFoundException(`Wallet item ${identifier} not found`);
    }

    return wallet;
  }

  private async insertWalletTransaction(
    data: {
      publicId?: string | null;
      walletItemId: string;
      userId: string;
      transactionType: string;
      amountChange: number;
      balanceAfter: number;
      referenceId?: string | null;
      referenceName?: string | null;
      timestamp?: string | null;
    },
    executor: SqlExecutor = this.db,
  ): Promise<WalletTransaction> {
    const result = await executor.query<WalletTransaction>(
      `
      insert into wallet_transactions (
        id,
        public_id,
        "walletItemId",
        "userId",
        "transactionType",
        "amountChange",
        "balanceAfter",
        "referenceId",
        "referenceName",
        timestamp
      )
      values (
        gen_random_uuid(),
        $1,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        coalesce($9::timestamptz, now())
      )
      returning
        coalesce(public_id, id::text) as id,
        $10::text as "walletItemId",
        "userId",
        "transactionType" as "transactionType",
        "amountChange"::float8 as "amountChange",
        "balanceAfter"::float8 as "balanceAfter",
        "referenceId" as "referenceId",
        "referenceName" as "referenceName",
        timestamp as timestamp
      `,
      [
        data.publicId ?? this.buildWalletPublicId('WTX'),
        data.walletItemId,
        data.userId,
        data.transactionType,
        data.amountChange,
        data.balanceAfter,
        data.referenceId ?? null,
        data.referenceName ?? null,
        data.timestamp ?? null,
        data.walletItemId,
      ],
    );

    return result.rows[0];
  }

  private async selectWalletItems(
    suffixSql: string,
    params: readonly unknown[] = [],
    executor: SqlExecutor = this.db,
  ): Promise<WalletItemContract[]> {
    const result = await executor.query<WalletItemContract>(
      `
      select
        coalesce(wi.public_id, wi.id::text) as id,
        wi."userId",
        wi.type,
        wi.title,
        coalesce(wi.subtitle, '') as subtitle,
        wi."expiryDate" as "expiryDate",
        wi."qrData" as "qrData",
        wi.status,
        coalesce(wi."isTransferable", false) as "isTransferable",
        wi."sponsoredBy" as "sponsoredBy",
        coalesce(wi.meta, '{}'::jsonb) as meta,
        wi."createdAt" as "createdAt",
        coalesce(wi."updatedAt", wi."createdAt", now()) as "updatedAt"
      from wallet_items wi
      ${suffixSql}
      `,
      [...params],
    );

    return result.rows;
  }

  private async selectGiftAllocations(
    suffixSql: string,
    params: readonly unknown[] = [],
    executor: SqlExecutor = this.db,
  ): Promise<GiftAllocation[]> {
    const result = await executor.query<GiftAllocation>(
      `
      select
        coalesce(ga.public_id, ga.id::text) as id,
        ga."sourceUserId" as "sourceUserId",
        ga."sourceUserName" as "sourceUserName",
        coalesce(wi.public_id, ga."entitlementId"::text) as "entitlementId",
        ga."itemName" as "itemName",
        ga."targetEmail" as "targetEmail",
        ga."claimToken" as "claimToken",
        ga.status,
        ga."claimedByUserId" as "claimedByUserId",
        ga."claimedAt" as "claimedAt",
        ga."createdAt" as "createdAt"
      from gift_allocations ga
      left join wallet_items wi on wi.id = ga."entitlementId"
      ${suffixSql}
      `,
      [...params],
    );

    return result.rows;
  }

  private buildWalletPublicId(prefix = 'WLT'): string {
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private toNullableTimestamp(value?: string | Date | null): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
