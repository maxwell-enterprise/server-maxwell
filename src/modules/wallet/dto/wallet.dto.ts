/**
 * MAXWELL ERP - Wallet DTOs
 */

import { z } from 'zod';
import {
  WalletItemStatusEnum,
  GiftDeliveryMethodEnum,
} from '../../../schemas/enums.schema';

// =============================================================================
// WALLET QUERY DTO
// =============================================================================

export const WalletQueryDtoSchema = z.object({
  status: WalletItemStatusEnum.optional(),
  tagId: z.string().uuid().optional(),
  includeExpired: z.coerce.boolean().default(false),
});

export type WalletQueryDto = z.infer<typeof WalletQueryDtoSchema>;

export const WalletItemsAdminQueryDtoSchema = z.object({
  userId: z.string().min(1).max(100).optional(),
  status: z.string().min(1).max(100).optional(),
});

export type WalletItemsAdminQueryDto = z.infer<
  typeof WalletItemsAdminQueryDtoSchema
>;

// =============================================================================
// CREATE GIFT DTO
// =============================================================================

export const CreateGiftDtoSchema = z
  .object({
    walletItemId: z.string().min(1).max(120),
    transferAmount: z.number().int().positive().default(1),
    recipientName: z.string().max(255).optional(),
    recipientEmail: z.string().email().optional(),
    recipientPhone: z.string().max(50).optional(),
    deliveryMethod: GiftDeliveryMethodEnum,
    giftMessage: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const name = data.recipientName?.trim() ?? '';
    const email = data.recipientEmail?.trim() ?? '';
    const phone = data.recipientPhone?.trim() ?? '';
    if (data.deliveryMethod === 'LINK') {
      if (!name) {
        ctx.addIssue({
          code: 'custom',
          message: 'Recipient name is required for link gifts',
          path: ['recipientName'],
        });
      }
      if (!phone) {
        ctx.addIssue({
          code: 'custom',
          message: 'Recipient phone is required for link gifts',
          path: ['recipientPhone'],
        });
      }
      return;
    }
    if (!email && !phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Recipient email or phone is required to share a ticket',
        path: ['recipientEmail'],
      });
    }
  });

export type CreateGiftDto = z.infer<typeof CreateGiftDtoSchema>;

export const GiftPreviewResponseSchema = z.object({
  status: z.enum(['PENDING', 'CLAIMED', 'REVOKED', 'EXPIRED']),
  sourceUserName: z.string(),
  itemName: z.string(),
  recipientName: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export type GiftPreviewResponse = z.infer<typeof GiftPreviewResponseSchema>;

// =============================================================================
// CLAIM GIFT DTO
// =============================================================================

export const ClaimGiftDtoSchema = z.object({
  token: z.string().min(1),
});

export type ClaimGiftDto = z.infer<typeof ClaimGiftDtoSchema>;

// =============================================================================
// REVOKE GIFT DTO
// =============================================================================

export const RevokeGiftDtoSchema = z.object({
  reason: z.string().optional(),
});

export type RevokeGiftDto = z.infer<typeof RevokeGiftDtoSchema>;

// =============================================================================
// WALLET HISTORY QUERY DTO
// =============================================================================

export const WalletHistoryQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type WalletHistoryQueryDto = z.infer<typeof WalletHistoryQueryDtoSchema>;

export const WalletHistoryListQueryDtoSchema = z.object({
  userId: z.string().min(1).max(100),
});

export type WalletHistoryListQueryDto = z.infer<
  typeof WalletHistoryListQueryDtoSchema
>;

export const WalletItemContractDtoSchema = z.object({
  id: z.string().min(1).max(120),
  userId: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(255).default(''),
  expiryDate: z.string().optional(),
  qrData: z.string().max(500).optional(),
  status: z.string().min(1).max(50),
  isTransferable: z.boolean().optional(),
  sponsoredBy: z.string().max(255).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type WalletItemContractDto = z.infer<typeof WalletItemContractDtoSchema>;

export const UpsertWalletItemsBatchDtoSchema = z.object({
  items: z.array(WalletItemContractDtoSchema).min(1),
});

export type UpsertWalletItemsBatchDto = z.infer<
  typeof UpsertWalletItemsBatchDtoSchema
>;

export const WalletTransactionLogDtoSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  walletItemId: z.string().min(1).max(120),
  userId: z.string().min(1).max(100),
  transactionType: z.string().min(1).max(50),
  amountChange: z.number(),
  balanceAfter: z.number(),
  referenceId: z.string().max(120).optional(),
  referenceName: z.string().max(255).optional(),
  timestamp: z.string().optional(),
});

export type WalletTransactionLogDto = z.infer<
  typeof WalletTransactionLogDtoSchema
>;

export const RedeemEventCreditDtoSchema = z.object({
  walletItemId: z.string().min(1).max(120),
  eventId: z.string().min(1).max(120),
  assignee: z.object({
    type: z.enum(['MYSELF', 'GUEST', 'DRAFT']),
    name: z.string().max(255).optional().default(''),
    email: z.string().email().optional().or(z.literal('')).default(''),
    phone: z.string().max(50).optional().default(''),
  }),
});

export type RedeemEventCreditDto = z.infer<typeof RedeemEventCreditDtoSchema>;

export const GiftAllocationDtoSchema = z.object({
  id: z.string().min(1).max(120),
  sourceUserId: z.string().min(1).max(100),
  sourceUserName: z.string().min(1).max(255),
  entitlementId: z.string().min(1).max(120),
  itemName: z.string().min(1).max(255),
  targetEmail: z.string().email().optional(),
  recipientPhone: z.string().max(50).optional(),
  claimToken: z.string().min(1).max(255),
  tokenExpiresAt: z.string().optional(),
  deliveryMethod: GiftDeliveryMethodEnum.optional(),
  giftMessage: z.string().max(500).optional(),
  status: z.string().min(1).max(50),
  claimedByUserId: z.string().max(100).optional(),
  claimedAt: z.string().optional(),
  revokedAt: z.string().optional(),
  revokeReason: z.string().optional(),
  createdAt: z.string().optional(),
});

export type GiftAllocationDto = z.infer<typeof GiftAllocationDtoSchema>;

export const TeamMembersQueryDtoSchema = z.object({
  orgId: z.string().min(1).max(120),
});

export type TeamMembersQueryDto = z.infer<typeof TeamMembersQueryDtoSchema>;

export const TeamMemberDtoSchema = z.object({
  id: z.string().min(1).max(120),
  orgId: z.string().min(1).max(120),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  status: z.string().min(1).max(50),
  joinedAt: z.string().optional(),
  lastActive: z.string().optional(),
});

export type TeamMemberDto = z.infer<typeof TeamMemberDtoSchema>;

export const UserEntitlementsDtoSchema = z.object({
  userId: z.string().min(1).max(100),
  permissions: z.array(z.string()),
  attributes: z.record(z.string(), z.unknown()),
  credits: z.number(),
});

export type UserEntitlementsDto = z.infer<typeof UserEntitlementsDtoSchema>;
