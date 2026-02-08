/**
 * MAXWELL ERP - Member Wallet Zod Schemas (User's Keys)
 */

import { z } from 'zod';
import {
  WalletItemStatusEnum,
  WalletTransactionTypeEnum,
  GiftStatusEnum,
  GiftDeliveryMethodEnum,
} from './enums.schema';

// =============================================================================
// MEMBER WALLET SCHEMA
// =============================================================================

export const MemberWalletSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tagId: z.string().uuid(),
  initialBalance: z.number().int().positive().default(1),
  balance: z.number().int().default(1),
  status: WalletItemStatusEnum.default('ACTIVE'),
  uniqueQrString: z.string().max(100),
  qrGeneratedAt: z.coerce.date(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
  sourceType: z.enum(['PURCHASE', 'TRANSFER', 'GIFT', 'ADMIN', 'PROMO']),
  sourceTransactionId: z.string().uuid().nullable().optional(),
  sponsorUserId: z.string().uuid().nullable().optional(),
  isGift: z.boolean().default(false),
  lockedAt: z.coerce.date().nullable().optional(),
  lockedReason: z.string().max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type MemberWallet = z.infer<typeof MemberWalletSchema>;

// Response dengan data tambahan
export const WalletItemResponseSchema = MemberWalletSchema.extend({
  tag: z
    .object({
      code: z.string(),
      name: z.string(),
      category: z.string(),
      colorHex: z.string().nullable(),
    })
    .optional(),
  applicableEvents: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        startTime: z.coerce.date(),
      }),
    )
    .optional(),
});

export type WalletItemResponse = z.infer<typeof WalletItemResponseSchema>;

// =============================================================================
// WALLET TRANSACTION SCHEMA (Audit Log)
// =============================================================================

export const WalletTransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: WalletTransactionTypeEnum,
  amount: z.number().int(),
  balanceBefore: z.number().int(),
  balanceAfter: z.number().int(),
  referenceType: z.string().max(50).nullable().optional(),
  referenceId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  relatedUserId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  performedBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

// =============================================================================
// GIFT ALLOCATION SCHEMA
// =============================================================================

export const GiftAllocationSchema = z.object({
  id: z.string().uuid(),
  token: z.string().max(100),
  tokenExpiresAt: z.coerce.date(),
  senderUserId: z.string().uuid(),
  walletItemId: z.string().uuid(),
  transferAmount: z.number().int().positive().default(1),
  recipientEmail: z.string().email().nullable().optional(),
  recipientPhone: z.string().max(20).nullable().optional(),
  recipientUserId: z.string().uuid().nullable().optional(),
  deliveryMethod: GiftDeliveryMethodEnum,
  deliverySentAt: z.coerce.date().nullable().optional(),
  giftMessage: z.string().nullable().optional(),
  status: GiftStatusEnum.default('PENDING'),
  claimedAt: z.coerce.date().nullable().optional(),
  revokedAt: z.coerce.date().nullable().optional(),
  revokeReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export type GiftAllocation = z.infer<typeof GiftAllocationSchema>;

// Create Gift Input
export const CreateGiftSchema = z.object({
  walletItemId: z.string().uuid(),
  transferAmount: z.number().int().positive().default(1),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
  deliveryMethod: GiftDeliveryMethodEnum,
  giftMessage: z.string().max(500).optional(),
});

export type CreateGiftInput = z.infer<typeof CreateGiftSchema>;

// Claim Gift Input
export const ClaimGiftSchema = z.object({
  token: z.string(),
});

export type ClaimGiftInput = z.infer<typeof ClaimGiftSchema>;

// Revoke Gift Input
export const RevokeGiftSchema = z.object({
  giftId: z.string().uuid(),
  reason: z.string().optional(),
});

export type RevokeGiftInput = z.infer<typeof RevokeGiftSchema>;

// =============================================================================
// MEMBERSHIP CARD SCHEMA
// =============================================================================

export const MembershipCardSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cardNumber: z.string().max(50),
  qrString: z.string().max(100),
  membershipTier: z
    .enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'])
    .default('BRONZE'),
  tierUpdatedAt: z.coerce.date(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
  isLifetime: z.boolean().default(false),
  cardDesignTemplate: z.string().default('default'),
  customDesignUrl: z.string().url().nullable().optional(),
  totalEventsAttended: z.number().int().default(0),
  totalPointsEarned: z.number().int().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type MembershipCard = z.infer<typeof MembershipCardSchema>;
