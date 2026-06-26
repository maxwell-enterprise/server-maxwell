/**
 * MAXWELL ERP - Wallet Service
 * Manages user's digital assets (tickets, credits, passes)
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
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
  RedeemEventCreditDto,
} from './dto';
import { DbService } from '../../common/db.service';
import { appendInvitationEmailLog } from '../../common/logging/invitation-email-log';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { AuthService } from '../auth/auth.service';

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

interface LockedGiftAllocationRow extends GiftAllocationRow {
  entitlementInternalId: string;
}

interface WalletTransactionRow extends WalletTransaction {
  internalId: string;
}

interface TeamMemberRow extends CorporateTeamMemberContract {
  internalId: string;
}

interface EventRedeemRow {
  internalId: string;
  id: string;
  name: string;
  date: string | Date | null;
  location: string | null;
  locationMode: string | null;
  onlineMeetingLink: string | null;
  creditTags: string[] | null;
  tiers:
    | Array<{
        id: string;
        name: string;
      }>
    | null;
}

export interface WalletMemberHubContext {
  appUserId: string;
  displayName: string | null;
  email: string | null;
  memberPublicId: string | null;
  gateScanQrPayload: string;
  membershipTier: string | null;
  cardNumber: string | null;
  gamification: {
    totalPoints: number;
    currentLevel: string;
    rank: number | null;
  } | null;
  card: MembershipCard | null;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly db: DbService,
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly auth: AuthService,
  ) {}
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
    void this.members.promoteLifecycleAtLeastByMemberId(
      data.userId,
      'PARTICIPANT',
    );
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

  async lookupWorkspaceUsersByIds(
    ids: readonly string[],
  ): Promise<
    Array<{ id: string; name: string; email: string; phone: string | null }>
  > {
    const unique = [
      ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
    ].slice(0, 500);
    if (unique.length === 0) {
      return [];
    }

    const result = await this.db.query<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
    }>(
      `
      select
        id,
        coalesce(nullif(trim(name), ''), '') as name,
        coalesce(nullif(trim(email), ''), '') as email,
        phone
      from "User"
      where id = any($1::text[])
      `,
      [unique],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name?.trim() || row.email?.trim() || '',
      email: row.email?.trim() || '',
      phone: row.phone?.trim() || null,
    }));
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
      on conflict (public_id) where (public_id is not null) do update
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

  async redeemEventCredit(
    userId: string,
    userEmail: string,
    dto: RedeemEventCreditDto,
  ): Promise<WalletItemContract> {
    const senderName = await this.resolveAppUserName(userId);
    const redemption = await this.db.withTransaction(async (client) => {
      const pass = await this.lockWalletItemRow(dto.walletItemId, client);
      if (pass.userId !== userId.trim()) {
        throw new ForbiddenException(
          'You can only redeem event credits from your own wallet',
        );
      }
      if (pass.type !== 'CREDIT_PASS') {
        throw new BadRequestException('Selected wallet item is not a credit pass');
      }
      if (pass.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Credit pass is ${pass.status.toLowerCase()} and cannot be redeemed`,
        );
      }

      const event = await this.findRedeemableEvent(dto.eventId, client);
      this.assertPassCanAccessEvent(pass.meta, event);

      const assigneeType = dto.assignee.type;
      const assigneeName =
        dto.assignee.name?.trim() ||
        (assigneeType === 'MYSELF' ? await this.resolveAppUserName(userId, client) : '');
      const assigneeEmail =
        dto.assignee.email?.trim() ||
        (assigneeType === 'MYSELF' ? userEmail.trim().toLowerCase() : '');
      const assigneePhone = dto.assignee.phone?.trim() || '';

      if (assigneeType === 'GUEST' && (!assigneeName || !assigneeEmail)) {
        throw new BadRequestException(
          'Guest redemption requires recipient name and email',
        );
      }

      const unlimited = Boolean(pass.meta?.isUnlimited);
      const currentCredits = this.readPassCredits(pass.meta);
      if (!unlimited && currentCredits < 1) {
        throw new BadRequestException('Insufficient credits');
      }

      const nextCredits = unlimited ? currentCredits : currentCredits - 1;
      const updatedPassMeta = {
        ...(pass.meta ?? {}),
        credits: nextCredits,
        balance: nextCredits,
        lastRedeemedEventId: event.id,
        lastRedeemedAt: new Date().toISOString(),
      };

      await this.upsertWalletItem(
        {
          id: pass.id,
          userId: pass.userId,
          type: pass.type,
          title: pass.title,
          subtitle: pass.subtitle,
          expiryDate: pass.expiryDate ?? null,
          qrData: pass.qrData ?? null,
          status: pass.status,
          isTransferable: pass.isTransferable,
          sponsoredBy: pass.sponsoredBy ?? null,
          meta: updatedPassMeta,
        },
        client,
      );

      await this.insertWalletTransaction(
        {
          walletItemId: pass.internalId,
          userId: pass.userId,
          transactionType: 'USAGE',
          amountChange: unlimited ? 0 : -1,
          balanceAfter: nextCredits,
          referenceId: event.id,
          referenceName: `Redeemed for ${event.name}`,
        },
        client,
      );

      const targetTier = this.resolveRedeemedTicketTier(pass.meta, event);
      const ticketPublicId = this.buildWalletPublicId('W-TKT');
      const ticketMeta: Record<string, unknown> = {
        eventId: event.id,
        location: event.location ?? null,
        locationMode: event.locationMode ?? null,
        onlineMeetingLink: event.onlineMeetingLink ?? null,
        targetTier,
        sourceCreditPassId: pass.id,
        sourceCreditTag:
          typeof pass.meta?.creditTag === 'string' ? pass.meta.creditTag : null,
      };

      if (assigneeType === 'DRAFT') {
        ticketMeta.redemptionMode = 'DRAFT';
      } else {
        ticketMeta.recipientName = assigneeName;
        ticketMeta.recipientEmail = assigneeEmail;
        ticketMeta.recipientPhone = assigneePhone;
      }

      let guestGift:
        | {
            publicId: string;
            recipientEmail: string;
            itemName: string;
          }
        | undefined;

      if (assigneeType === 'GUEST') {
        const giftPublicId = this.buildWalletPublicId('GFT');
        ticketMeta.pendingClaimIssuedAt = new Date().toISOString();
        ticketMeta.giftAllocationId = giftPublicId;
        guestGift = {
          publicId: giftPublicId,
          recipientEmail: assigneeEmail,
          itemName: event.name,
        };
      }

      const ticket = await this.upsertWalletItem(
        {
          id: ticketPublicId,
          userId: userId.trim(),
          type: 'TICKET',
          title: event.name,
          subtitle:
            assigneeType === 'MYSELF'
              ? targetTier
              : assigneeType === 'DRAFT'
                ? 'Draft - assign later'
                : `Guest: ${assigneeName}`,
          expiryDate: this.toNullableTimestamp(event.date),
          qrData: `TICKET:${event.id}:${userId.trim()}:${ticketPublicId}`,
          status: assigneeType === 'GUEST' ? 'PENDING_CLAIM' : 'ACTIVE',
          isTransferable: assigneeType !== 'MYSELF',
          sponsoredBy: assigneeType === 'MYSELF' ? null : userId.trim(),
          meta: ticketMeta,
        },
        client,
      );
      const issuedWallet = await this.resolveWalletOwner(ticket.id, client);

      await this.insertWalletTransaction(
        {
          walletItemId: issuedWallet.internalId,
          userId: userId.trim(),
          transactionType: 'ISSUANCE',
          amountChange: 1,
          balanceAfter: 1,
          referenceId: event.id,
          referenceName: `Ticket issued for ${event.name}`,
        },
        client,
      );

      if (assigneeType === 'GUEST' && assigneeEmail && guestGift) {
        await this.ensureGiftAllocationRuntimeColumns(client);
        const claimToken = this.buildGiftClaimToken();
        const tokenExpiresAt = this.addDays(new Date(), 7).toISOString();
        await client.query(
          `
          insert into gift_allocations (
            public_id,
            "sourceUserId",
            "sourceUserName",
            "entitlementId",
            "itemName",
            "targetEmail",
            "recipientPhone",
            "claimToken",
            "tokenExpiresAt",
            "deliveryMethod",
            "giftMessage",
            status,
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
            $9::timestamptz,
            'EMAIL',
            $10,
            'PENDING',
            now()
          )
          `,
          [
            guestGift.publicId,
            userId.trim(),
            senderName,
            issuedWallet.internalId,
            event.name,
            assigneeEmail,
            assigneePhone || null,
            claimToken,
            tokenExpiresAt,
            `Redeemed for ${assigneeName}`,
          ],
        );

        await this.insertWalletTransaction(
          {
            walletItemId: issuedWallet.internalId,
            userId: userId.trim(),
            transactionType: 'TRANSFER_OUT',
            amountChange: 0,
            balanceAfter: 0,
            referenceId: guestGift.publicId,
            referenceName: `Guest claim pending: ${event.name}`,
          },
          client,
        );

        await this.ensureShadowMember(
          assigneeEmail,
          assigneeName || assigneeEmail,
          assigneePhone,
          client,
        );
      }

      return {
        ticket,
        guestGift,
      };
    });

    if (redemption.guestGift?.recipientEmail) {
      void this.auth
        .sendGiftTicketRecipientSupabaseInvite({
          email: redemption.guestGift.recipientEmail,
          itemName: redemption.guestGift.itemName,
          donorName: senderName,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Post-redeem guest invite async error (${redemption.guestGift?.recipientEmail}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    return redemption.ticket;
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
    await this.ensureGiftAllocationRuntimeColumns();
    return this.selectGiftAllocations('order by ga."createdAt" desc');
  }

  async getGiftInbox(userEmail: string): Promise<GiftAllocation[]> {
    await this.ensureGiftAllocationRuntimeColumns();
    const email = userEmail.trim().toLowerCase();
    if (!email) {
      return [];
    }
    return this.selectGiftAllocations(
      `
      where ga.status = 'PENDING'
        and (
          lower(coalesce(ga."targetEmail", '')) = $1
          or lower(coalesce(wi.meta->>'recipientEmail', '')) = $1
        )
      order by ga."createdAt" desc
      `,
      [email],
    );
  }

  async upsertGiftAllocation(
    gift: GiftAllocation,
    executor: SqlExecutor = this.db,
  ): Promise<GiftAllocation> {
    await this.ensureGiftAllocationRuntimeColumns(executor);
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
        "recipientPhone",
        "claimToken",
        "tokenExpiresAt",
        "deliveryMethod",
        "giftMessage",
        status,
        "claimedByUserId",
        "claimedAt",
        "revokedAt",
        "revokeReason",
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
        $9::timestamptz,
        $10,
        $11,
        $12,
        $13,
        $14::timestamptz,
        $15::timestamptz,
        $16,
        $17::timestamptz
      )
      on conflict (public_id) where (public_id is not null) do update
      set "sourceUserId" = excluded."sourceUserId",
          "sourceUserName" = excluded."sourceUserName",
          "entitlementId" = excluded."entitlementId",
          "itemName" = excluded."itemName",
          "targetEmail" = excluded."targetEmail",
          "recipientPhone" = excluded."recipientPhone",
          "claimToken" = excluded."claimToken",
          "tokenExpiresAt" = excluded."tokenExpiresAt",
          "deliveryMethod" = excluded."deliveryMethod",
          "giftMessage" = excluded."giftMessage",
          status = excluded.status,
          "claimedByUserId" = excluded."claimedByUserId",
          "claimedAt" = excluded."claimedAt",
          "revokedAt" = excluded."revokedAt",
          "revokeReason" = excluded."revokeReason"
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        "sourceUserId" as "sourceUserId",
        "sourceUserName" as "sourceUserName",
        $18::text as "entitlementId",
        "itemName" as "itemName",
        "targetEmail" as "targetEmail",
        "recipientPhone" as "recipientPhone",
        "claimToken" as "claimToken",
        "tokenExpiresAt" as "tokenExpiresAt",
        "deliveryMethod" as "deliveryMethod",
        "giftMessage" as "giftMessage",
        status,
        "claimedByUserId" as "claimedByUserId",
        "claimedAt" as "claimedAt",
        "revokedAt" as "revokedAt",
        "revokeReason" as "revokeReason",
        "createdAt" as "createdAt"
      `,
      [
        gift.id.trim(),
        gift.sourceUserId,
        gift.sourceUserName,
        wallet.internalId,
        gift.itemName,
        gift.targetEmail ?? null,
        gift.recipientPhone ?? null,
        gift.claimToken,
        this.toNullableTimestamp(gift.tokenExpiresAt ?? null),
        gift.deliveryMethod ?? null,
        gift.giftMessage ?? null,
        gift.status,
        gift.claimedByUserId ?? null,
        this.toNullableTimestamp(gift.claimedAt ?? null),
        this.toNullableTimestamp(gift.revokedAt ?? null),
        gift.revokeReason ?? null,
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
      on conflict (public_id) where (public_id is not null) do update
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
    const recipientEmail = dto.recipientEmail?.trim().toLowerCase() || null;
    const recipientPhone = dto.recipientPhone?.trim() || null;
    const recipientName = dto.recipientName?.trim() || null;
    if (dto.transferAmount !== 1) {
      throw new BadRequestException(
        'Ticket sharing currently supports full-ticket transfer only',
      );
    }
    if (dto.deliveryMethod === 'LINK') {
      if (!recipientName) {
        throw new BadRequestException(
          'Recipient name is required for link gifts',
        );
      }
      if (!recipientPhone) {
        throw new BadRequestException(
          'Recipient phone is required for link gifts',
        );
      }
    } else if (!recipientEmail && !recipientPhone) {
      throw new BadRequestException(
        'Recipient email or phone is required to share a ticket',
      );
    }

    const sender = await this.prisma.user
      .findUnique({
        where: { id: senderId.trim() },
        select: { name: true },
      })
      .catch(() => null);
    const senderName = sender?.name?.trim() || senderId.trim();

    const allocation = await this.db.withTransaction(async (client) => {
      await this.ensureGiftAllocationRuntimeColumns(client);
      const wallet = await this.lockWalletItemRow(dto.walletItemId, client);
      this.assertWalletShareable(wallet, senderId);

      const pendingGift = await client.query<{ id: string }>(
        `
        select coalesce(public_id, id::text) as id
        from gift_allocations
        where "entitlementId" = $1::uuid
          and status = 'PENDING'
          and (
            "tokenExpiresAt" is null
            or "tokenExpiresAt" > now()
          )
        limit 1
        `,
        [wallet.internalId],
      );
      if (pendingGift.rows[0]?.id) {
        throw new ConflictException(
          `Ticket already has a pending share (${pendingGift.rows[0].id})`,
        );
      }

      const giftPublicId = this.buildWalletPublicId('GFT');
      const claimToken = this.buildGiftClaimToken();
      const tokenExpiresAt = this.addDays(new Date(), 7).toISOString();
      const updatedMeta = {
        ...(wallet.meta ?? {}),
        recipientName,
        recipientEmail,
        recipientPhone,
        pendingClaimIssuedAt: new Date().toISOString(),
        giftAllocationId: giftPublicId,
      };

      await this.upsertWalletItem(
        {
          id: wallet.id,
          userId: wallet.userId,
          type: wallet.type,
          title: wallet.title,
          subtitle: wallet.subtitle,
          expiryDate: wallet.expiryDate ?? null,
          qrData: wallet.qrData ?? null,
          status: 'PENDING_CLAIM',
          isTransferable: wallet.isTransferable,
          sponsoredBy: wallet.sponsoredBy ?? null,
          meta: updatedMeta,
        },
        client,
      );

      await client.query(
        `
        insert into gift_allocations (
          public_id,
          "sourceUserId",
          "sourceUserName",
          "entitlementId",
          "itemName",
          "targetEmail",
          "recipientName",
          "recipientPhone",
          "claimToken",
          "tokenExpiresAt",
          "deliveryMethod",
          "giftMessage",
          status,
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
          $11,
          $12,
          'PENDING',
          now()
        )
        `,
        [
          giftPublicId,
          senderId.trim(),
          senderName,
          wallet.internalId,
          wallet.title,
          recipientEmail,
          recipientName,
          recipientPhone,
          claimToken,
          tokenExpiresAt,
          dto.deliveryMethod,
          dto.giftMessage?.trim() || null,
        ],
      );

      await this.insertWalletTransaction(
        {
          walletItemId: wallet.internalId,
          userId: senderId.trim(),
          transactionType: 'TRANSFER_OUT',
          amountChange: 0,
          balanceAfter: 0,
          referenceId: giftPublicId,
          referenceName: `Gift pending: ${wallet.title}`,
        },
        client,
      );

      const created = await this.selectGiftAllocations(
        'where ga.public_id = $1 limit 1',
        [giftPublicId],
        client,
      );
      const allocation = created[0];
      if (!allocation) {
        throw new NotFoundException('Gift allocation was not created');
      }
      return allocation;
    });

    if (recipientEmail) {
      void appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_queued',
        status: 'queued',
        targetEmail: recipientEmail,
        giftId: allocation.id,
        itemName: allocation.itemName,
        donorName: allocation.sourceUserName,
        metadata: {
          deliveryMethod: dto.deliveryMethod,
          walletItemId: dto.walletItemId,
        },
      });
      void this.auth
        .sendGiftTicketRecipientSupabaseInvite({
          giftId: allocation.id,
          email: recipientEmail,
          itemName: allocation.itemName,
          donorName: allocation.sourceUserName,
        })
        .catch((err: unknown) => {
          void appendInvitationEmailLog({
            event: 'manage_invitation_email_dispatch_failed',
            status: 'failed',
            targetEmail: recipientEmail,
            giftId: allocation.id,
            itemName: allocation.itemName,
            donorName: allocation.sourceUserName,
            reason: err instanceof Error ? err.message : String(err),
            metadata: {
              deliveryMethod: dto.deliveryMethod,
              walletItemId: dto.walletItemId,
            },
          });
          this.logger.warn(
            `Post-gift Supabase invite async error (${recipientEmail}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    } else {
      void appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_skipped',
        status: 'skipped',
        targetEmail: null,
        giftId: allocation.id,
        itemName: allocation.itemName,
        donorName: allocation.sourceUserName,
        reason: 'recipient email not provided',
        metadata: {
          deliveryMethod: dto.deliveryMethod,
          walletItemId: dto.walletItemId,
          recipientPhoneProvided: Boolean(recipientPhone),
        },
      });
    }

    return allocation;
  }

  /**
   * Public, sanitized gift preview for `/claim?token=…` (no auth).
   */
  async previewGiftByToken(token: string): Promise<{
    status: 'PENDING' | 'CLAIMED' | 'REVOKED' | 'EXPIRED';
    sourceUserName: string;
    itemName: string;
    recipientName?: string | null;
    expiresAt?: string | null;
  }> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Token is required');
    }

    await this.ensureGiftAllocationRuntimeColumns();
    const gifts = await this.selectGiftAllocations(
      `
      where ga."claimToken" = $1
      limit 1
      `,
      [normalizedToken],
    );
    const gift = gifts[0];
    if (!gift) {
      throw new NotFoundException('Invalid gift link');
    }

    const expiresAt = gift.tokenExpiresAt
      ? new Date(gift.tokenExpiresAt).toISOString()
      : null;

    if (gift.tokenExpiresAt && new Date(gift.tokenExpiresAt) <= new Date()) {
      return {
        status: 'EXPIRED',
        sourceUserName: gift.sourceUserName,
        itemName: gift.itemName,
        recipientName: await this.readGiftRecipientName(
          gift.entitlementId,
          gift.recipientName,
        ),
        expiresAt,
      };
    }

    const recipientName = await this.readGiftRecipientName(
      gift.entitlementId,
      gift.recipientName,
    );
    const status =
      gift.status === 'PENDING' ||
      gift.status === 'CLAIMED' ||
      gift.status === 'REVOKED'
        ? gift.status
        : 'PENDING';

    return {
      status,
      sourceUserName: gift.sourceUserName,
      itemName: gift.itemName,
      recipientName,
      expiresAt,
    };
  }

  private async readGiftRecipientName(
    entitlementId: string,
    persistedName?: string | null,
  ): Promise<string | null> {
    const stored = persistedName?.trim();
    if (stored) return stored;
    const row = await this.getWalletItemRow(entitlementId).catch(() => null);
    if (!row) return null;
    const meta = row.meta ?? {};
    const name = meta.recipientName;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  /**
   * Claim a gift (receive transferred ticket)
   */
  async claimGift(
    recipientId: string,
    dto: ClaimGiftDto,
  ): Promise<WalletItemContract> {
    const recipientUser = await this.prisma.user
      .findUnique({
        where: { id: recipientId.trim() },
        select: { email: true, name: true },
      })
      .catch(() => null);
    const recipientEmail = recipientUser?.email?.trim().toLowerCase() || null;

    return this.db.withTransaction(async (client) => {
      await this.ensureGiftAllocationRuntimeColumns(client);
      const gift = await this.lockGiftAllocationByToken(dto.token, client);
      if (!gift) {
        throw new NotFoundException('Invalid or expired gift token');
      }
      if (gift.status !== 'PENDING') {
        throw new BadRequestException(
          `Gift is already ${gift.status.toLowerCase()}`,
        );
      }
      if (gift.tokenExpiresAt && new Date(gift.tokenExpiresAt) <= new Date()) {
        await client.query(
          `
          update gift_allocations
          set status = 'EXPIRED'
          where id = $1::uuid
          `,
          [gift.internalId],
        );
        throw new BadRequestException('Gift link has expired');
      }
      if (
        gift.targetEmail &&
        recipientEmail &&
        gift.targetEmail.trim().toLowerCase() !== recipientEmail
      ) {
        throw new ForbiddenException(
          'This gift was issued to a different recipient email',
        );
      }

      const wallet = await this.lockWalletItemRow(gift.entitlementInternalId, client);
      if (wallet.status !== 'PENDING_CLAIM') {
        throw new ConflictException(
          'Shared ticket is no longer available to be claimed',
        );
      }

      if (recipientEmail) {
        await this.ensureShadowMember(
          recipientEmail,
          recipientUser?.name?.trim() ||
            this.readWalletRecipientName(wallet.meta) ||
            gift.targetEmail?.split('@')[0] ||
            'Gift Recipient',
          wallet.meta?.recipientPhone,
          client,
        );
      }

      const claimedMeta = {
        ...(wallet.meta ?? {}),
        recipientEmail: gift.targetEmail ?? recipientEmail,
        recipientPhone:
          gift.recipientPhone ?? this.readWalletRecipientPhone(wallet.meta),
        pendingClaimIssuedAt: undefined,
        giftAllocationId: gift.id,
        claimedAt: new Date().toISOString(),
      };
      delete claimedMeta.pendingClaimIssuedAt;

      const claimedWallet = await this.upsertWalletItem(
        {
          id: wallet.id,
          userId: recipientId.trim(),
          type: wallet.type,
          title: wallet.title,
          subtitle: wallet.subtitle,
          expiryDate: wallet.expiryDate ?? null,
          qrData: wallet.qrData ?? null,
          status: 'ACTIVE',
          isTransferable: wallet.isTransferable,
          sponsoredBy: gift.sourceUserName,
          meta: claimedMeta,
        },
        client,
      );

      await client.query(
        `
        update gift_allocations
        set status = 'CLAIMED',
            "claimedByUserId" = $2,
            "claimedAt" = now()
        where id = $1::uuid
        `,
        [gift.internalId, recipientId.trim()],
      );

      await this.insertWalletTransaction(
        {
          walletItemId: wallet.internalId,
          userId: recipientId.trim(),
          transactionType: 'TRANSFER_IN',
          amountChange: 1,
          balanceAfter: 1,
          referenceId: gift.id,
          referenceName: `Gift claimed: ${wallet.title}`,
        },
        client,
      );

      return claimedWallet;
    });
  }

  /**
   * Revoke a pending gift
   */
  async revokeGift(
    senderId: string,
    giftId: string,
    dto: RevokeGiftDto,
  ): Promise<GiftAllocation> {
    return this.db.withTransaction(async (client) => {
      await this.ensureGiftAllocationRuntimeColumns(client);
      const gift = await this.lockGiftAllocationById(giftId, client);
      if (!gift) {
        throw new NotFoundException('Gift not found');
      }
      if (gift.sourceUserId !== senderId.trim()) {
        throw new ForbiddenException('You can only revoke your own gifts');
      }
      if (gift.status !== 'PENDING') {
        throw new BadRequestException('Can only revoke pending gifts');
      }

      const wallet = await this.lockWalletItemRow(gift.entitlementInternalId, client);
      const restoredMeta = {
        ...(wallet.meta ?? {}),
      };
      delete restoredMeta.recipientName;
      delete restoredMeta.recipientEmail;
      delete restoredMeta.recipientPhone;
      delete restoredMeta.pendingClaimIssuedAt;
      delete restoredMeta.giftAllocationId;
      delete restoredMeta.claimedAt;

      await this.upsertWalletItem(
        {
          id: wallet.id,
          userId: senderId.trim(),
          type: wallet.type,
          title: wallet.title,
          subtitle: wallet.subtitle,
          expiryDate: wallet.expiryDate ?? null,
          qrData: wallet.qrData ?? null,
          status: 'ACTIVE',
          isTransferable: wallet.isTransferable,
          sponsoredBy: null,
          meta: restoredMeta,
        },
        client,
      );

      await client.query(
        `
        update gift_allocations
        set status = 'REVOKED',
            "revokedAt" = now(),
            "revokeReason" = $2
        where id = $1::uuid
        `,
        [gift.internalId, dto.reason?.trim() || null],
      );

      await this.insertWalletTransaction(
        {
          walletItemId: wallet.internalId,
          userId: senderId.trim(),
          transactionType: 'TRANSFER_IN',
          amountChange: 0,
          balanceAfter: 1,
          referenceId: gift.id,
          referenceName: `Gift revoked: ${wallet.title}`,
        },
        client,
      );

      const revoked = await this.selectGiftAllocations(
        'where ga.public_id = $1 or ga.id::text = $1 limit 1',
        [giftId.trim()],
        client,
      );
      const allocation = revoked[0];
      if (!allocation) {
        throw new NotFoundException('Revoked gift could not be reloaded');
      }
      return allocation;
    });
  }

  /**
   * Get user's sent gifts
   */
  async getSentGifts(userId: string): Promise<GiftAllocation[]> {
    await this.ensureGiftAllocationRuntimeColumns();
    return this.selectGiftAllocations(
      'where ga."sourceUserId" = $1 order by ga."createdAt" desc',
      [userId],
    );
  }

  /**
   * Get user's received gifts
   */
  async getReceivedGifts(userId: string): Promise<GiftAllocation[]> {
    await this.ensureGiftAllocationRuntimeColumns();
    return this.selectGiftAllocations(
      'where ga."claimedByUserId" = $1 order by ga."createdAt" desc',
      [userId],
    );
  }

  private async findGiftByToken(token: string): Promise<GiftAllocation | null> {
    await this.ensureGiftAllocationRuntimeColumns();
    const rows = await this.selectGiftAllocations(
      'where ga."claimToken" = $1 limit 1',
      [token],
    );
    return rows[0] ?? null;
  }

  private async findGiftById(id: string): Promise<GiftAllocation | null> {
    await this.ensureGiftAllocationRuntimeColumns();
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
    const result = await this.db
      .query<MembershipCard>(
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
      )
      .catch(() => ({ rows: [] as MembershipCard[] }));

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
   * Member Wallet hub: digital card row + CRM member id + gamification for gate scan / UI.
   */
  async getMemberHubContext(userId: string): Promise<WalletMemberHubContext> {
    const uid = userId.trim();
    const user = await this.prisma.user.findUnique({
      where: { id: uid },
      select: { email: true, name: true },
    });
    const emailLc = user?.email?.trim().toLowerCase() ?? '';
    let memberPublicId: string | null = null;
    let memberName: string | null = null;
    if (emailLc) {
      const digest = await this.members.findMemberDigestByEmail(emailLc);
      memberPublicId = digest?.publicId ?? null;
      memberName = digest?.name ?? null;
    }
    let gamification: WalletMemberHubContext['gamification'] = null;
    try {
      const g = await this.db.query<{
        totalPoints: number;
        currentLevel: string;
        rank: number | null;
      }>(
        `
        select "totalPoints", "currentLevel", rank
        from gamification_profiles
        where "userId" = $1
        limit 1
        `,
        [uid],
      );
      const row = g.rows[0];
      if (row) {
        gamification = {
          totalPoints: Number(row.totalPoints) || 0,
          currentLevel: String(row.currentLevel ?? '1'),
          rank: row.rank != null ? Number(row.rank) : null,
        };
      }
    } catch {
      gamification = null;
    }
    let card: MembershipCard | null = null;
    try {
      card = (await this.getMembershipCard(uid)) ?? null;
    } catch {
      card = null;
    }
    const gateScanQrPayload =
      (card?.qrString && String(card.qrString).trim()) ||
      `MEMBER:${uid}:${emailLc || 'user'}`;
    const membershipTier = card?.membershipTier?.trim() || null;
    return {
      appUserId: uid,
      displayName: user?.name?.trim() || memberName || null,
      email: user?.email ?? null,
      memberPublicId,
      gateScanQrPayload,
      membershipTier,
      cardNumber: card?.cardNumber ?? null,
      gamification,
      card,
    };
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
    await this.ensureGiftAllocationRuntimeColumns(executor);
    const result = await executor.query<GiftAllocation>(
      `
      select
        coalesce(ga.public_id, ga.id::text) as id,
        ga."sourceUserId" as "sourceUserId",
        ga."sourceUserName" as "sourceUserName",
        coalesce(wi.public_id, ga."entitlementId"::text) as "entitlementId",
        ga."itemName" as "itemName",
        ga."targetEmail" as "targetEmail",
        coalesce(
          nullif(btrim(ga."recipientName"), ''),
          nullif(btrim(wi.meta->>'recipientName'), '')
        ) as "recipientName",
        ga."recipientPhone" as "recipientPhone",
        ga."claimToken" as "claimToken",
        ga."tokenExpiresAt" as "tokenExpiresAt",
        ga."deliveryMethod" as "deliveryMethod",
        ga."giftMessage" as "giftMessage",
        ga.status,
        ga."claimedByUserId" as "claimedByUserId",
        ga."claimedAt" as "claimedAt",
        ga."revokedAt" as "revokedAt",
        ga."revokeReason" as "revokeReason",
        ga."createdAt" as "createdAt"
      from gift_allocations ga
      left join wallet_items wi on wi.id = ga."entitlementId"
      ${suffixSql}
      `,
      [...params],
    );

    return result.rows;
  }

  private async ensureGiftAllocationRuntimeColumns(
    executor: SqlExecutor = this.db,
  ): Promise<void> {
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "recipientName" text
      `,
    );
    await executor.query(
      `
      update gift_allocations ga
      set "recipientName" = wi.meta->>'recipientName'
      from wallet_items wi
      where ga."entitlementId" = wi.id
        and (ga."recipientName" is null or btrim(ga."recipientName") = '')
        and wi.meta ? 'recipientName'
        and btrim(wi.meta->>'recipientName') <> ''
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "recipientPhone" text
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "tokenExpiresAt" timestamptz
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "deliveryMethod" text
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "giftMessage" text
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "revokedAt" timestamptz
      `,
    );
    await executor.query(
      `
      alter table if exists gift_allocations
      add column if not exists "revokeReason" text
      `,
    );
    await executor.query(
      `
      update gift_allocations
      set "tokenExpiresAt" = coalesce("tokenExpiresAt", "createdAt" + interval '7 days'),
          "deliveryMethod" = coalesce(nullif(btrim("deliveryMethod"), ''), 'EMAIL')
      where "tokenExpiresAt" is null
         or "deliveryMethod" is null
         or btrim("deliveryMethod") = ''
      `,
    );
  }

  private async getWalletItemRow(
    identifier: string,
    executor: SqlExecutor = this.db,
  ): Promise<WalletItemContractRow> {
    const result = await executor.query<WalletItemContractRow>(
      `
      select
        wi.id::text as "internalId",
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
      where wi.public_id = $1 or wi.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Wallet item ${identifier} not found`);
    }
    return row;
  }

  private async lockWalletItemRow(
    identifier: string,
    executor: SqlExecutor,
  ): Promise<WalletItemContractRow> {
    const result = await executor.query<WalletItemContractRow>(
      `
      select
        wi.id::text as "internalId",
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
      where wi.public_id = $1 or wi.id::text = $1
      for update
      `,
      [identifier.trim()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Wallet item ${identifier} not found`);
    }
    return row;
  }

  private async lockGiftAllocationByToken(
    token: string,
    executor: SqlExecutor,
  ): Promise<LockedGiftAllocationRow | null> {
    const result = await executor.query<LockedGiftAllocationRow>(
      `
      select
        ga.id::text as "internalId",
        coalesce(ga.public_id, ga.id::text) as id,
        ga."sourceUserId" as "sourceUserId",
        ga."sourceUserName" as "sourceUserName",
        ga."entitlementId"::text as "entitlementInternalId",
        coalesce(wi.public_id, ga."entitlementId"::text) as "entitlementId",
        ga."itemName" as "itemName",
        ga."targetEmail" as "targetEmail",
        ga."recipientPhone" as "recipientPhone",
        ga."claimToken" as "claimToken",
        ga."tokenExpiresAt" as "tokenExpiresAt",
        ga."deliveryMethod" as "deliveryMethod",
        ga."giftMessage" as "giftMessage",
        ga.status,
        ga."claimedByUserId" as "claimedByUserId",
        ga."claimedAt" as "claimedAt",
        ga."revokedAt" as "revokedAt",
        ga."revokeReason" as "revokeReason",
        ga."createdAt" as "createdAt"
      from gift_allocations ga
      left join wallet_items wi on wi.id = ga."entitlementId"
      where ga."claimToken" = $1
      limit 1
      for update of ga
      `,
      [token.trim()],
    );
    return result.rows[0] ?? null;
  }

  private async lockGiftAllocationById(
    identifier: string,
    executor: SqlExecutor,
  ): Promise<LockedGiftAllocationRow | null> {
    const result = await executor.query<LockedGiftAllocationRow>(
      `
      select
        ga.id::text as "internalId",
        coalesce(ga.public_id, ga.id::text) as id,
        ga."sourceUserId" as "sourceUserId",
        ga."sourceUserName" as "sourceUserName",
        ga."entitlementId"::text as "entitlementInternalId",
        coalesce(wi.public_id, ga."entitlementId"::text) as "entitlementId",
        ga."itemName" as "itemName",
        ga."targetEmail" as "targetEmail",
        ga."recipientPhone" as "recipientPhone",
        ga."claimToken" as "claimToken",
        ga."tokenExpiresAt" as "tokenExpiresAt",
        ga."deliveryMethod" as "deliveryMethod",
        ga."giftMessage" as "giftMessage",
        ga.status,
        ga."claimedByUserId" as "claimedByUserId",
        ga."claimedAt" as "claimedAt",
        ga."revokedAt" as "revokedAt",
        ga."revokeReason" as "revokeReason",
        ga."createdAt" as "createdAt"
      from gift_allocations ga
      left join wallet_items wi on wi.id = ga."entitlementId"
      where ga.public_id = $1 or ga.id::text = $1
      limit 1
      for update of ga
      `,
      [identifier.trim()],
    );
    return result.rows[0] ?? null;
  }

  private assertWalletShareable(
    wallet: WalletItemContractRow,
    senderId: string,
  ): void {
    if (wallet.userId !== senderId.trim()) {
      throw new ForbiddenException('You can only share your own tickets');
    }
    if (wallet.type !== 'TICKET') {
      throw new BadRequestException('Only ticket items can be shared');
    }
    if (!wallet.isTransferable) {
      throw new BadRequestException('This ticket is not transferable');
    }
    if (['USED', 'EXPIRED', 'CANCELLED'].includes(wallet.status)) {
      throw new BadRequestException(
        `This ticket cannot be shared because it is ${wallet.status.toLowerCase()}`,
      );
    }
    if (['LOCKED', 'PENDING_CLAIM', 'GIFT_PENDING'].includes(wallet.status)) {
      throw new ConflictException('This ticket is already in a transfer flow');
    }
  }

  private async ensureShadowMember(
    rawEmail: string,
    displayName: string,
    phone: unknown,
    executor: SqlExecutor,
  ): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return;
    const existing = await executor.query<{ id: string }>(
      `
      select id::text as id
      from members
      where lower(trim(email)) = $1
      limit 1
      `,
      [email],
    );
    if (existing.rows[0]?.id) {
      return;
    }
    const publicId = `MEM-${crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 12)
      .toUpperCase()}`;
    await executor.query(
      `
      insert into members (
        public_id,
        name,
        email,
        phone,
        category,
        scholarship,
        "joinMonth",
        program,
        "mentorshipDuration",
        "nTagStatus",
        platform,
        "regInUS",
        "lifecycleStage",
        facilitator_type,
        tags,
        achievements,
        "earnedDoneTags",
        engagement,
        "createdAt",
        "updatedAt"
      )
      values (
        $1,
        $2,
        $3,
        $4,
        'Member',
        false,
        to_char(now(), 'YYYY-MM'),
        'Gifted Access',
        0,
        '',
        'Digital',
        false,
        'IDENTIFIED',
        'INHERIT',
        '{}'::text[],
        '[]'::jsonb,
        '{}'::text[],
        $5::jsonb,
        now(),
        now()
      )
      on conflict (public_id) do nothing
      `,
      [
        publicId,
        displayName.trim().slice(0, 255) || 'Gift Recipient',
        email,
        typeof phone === 'string' ? phone.slice(0, 50) : '',
        JSON.stringify({
          lastActiveDate: new Date().toISOString(),
          eventsAttendedCount: 0,
          contentCompletionRate: 0,
          communityReputationScore: 0,
          leadScore: 0,
        }),
      ],
    );
  }

  private readWalletRecipientName(
    meta: Record<string, unknown> | undefined,
  ): string | null {
    const value = meta?.recipientName;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readWalletRecipientPhone(
    meta: Record<string, unknown> | undefined,
  ): string | null {
    const value = meta?.recipientPhone;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async findRedeemableEvent(
    identifier: string,
    executor: SqlExecutor = this.db,
  ): Promise<EventRedeemRow> {
    const result = await executor.query<EventRedeemRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e.location,
        e."locationMode" as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink",
        e."creditTags" as "creditTags",
        e.tiers
      from events e
      where e.public_id = $1 or e.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );

    const event = result.rows[0];
    if (!event) {
      throw new NotFoundException(`Event ${identifier} not found`);
    }
    return event;
  }

  private assertPassCanAccessEvent(
    meta: Record<string, unknown> | undefined,
    event: EventRedeemRow,
  ): void {
    const passTag =
      typeof meta?.creditTag === 'string'
        ? meta.creditTag.trim()
        : typeof meta?.tag === 'string'
          ? meta.tag.trim()
          : '';
    const eventTags = (event.creditTags ?? [])
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);

    if (eventTags.length > 0 && passTag && !eventTags.includes(passTag)) {
      throw new BadRequestException(
        'This credit pass cannot be redeemed for the selected event',
      );
    }
  }

  private readPassCredits(meta: Record<string, unknown> | undefined): number {
    const candidates = [meta?.credits, meta?.balance, meta?.initialBalance];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return 0;
  }

  private resolveRedeemedTicketTier(
    meta: Record<string, unknown> | undefined,
    event: EventRedeemRow,
  ): string {
    const directTier =
      typeof meta?.targetTier === 'string' && meta.targetTier.trim()
        ? meta.targetTier.trim()
        : '';
    if (directTier) {
      return directTier;
    }

    const firstTier = event.tiers?.[0];
    if (firstTier?.id?.trim()) {
      return firstTier.id.trim();
    }
    if (firstTier?.name?.trim()) {
      return firstTier.name.trim();
    }

    return 'GENERAL';
  }

  private async resolveAppUserName(
    userId: string,
    executor: SqlExecutor = this.db,
  ): Promise<string> {
    const result = await executor.query<{ name: string | null }>(
      `
      select coalesce(nullif(trim(name), ''), nullif(trim(email), '')) as name
      from "User"
      where id = $1
      limit 1
      `,
      [userId.trim()],
    );

    return result.rows[0]?.name?.trim() || 'Member';
  }

  private buildWalletPublicId(prefix = 'WLT'): string {
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private buildGiftClaimToken(): string {
    return `gift_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toNullableTimestamp(value?: string | Date | null): string | null {
    if (value == null || value === '') {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d.toISOString();
  }
}
