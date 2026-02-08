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

// =============================================================================
// CREATE GIFT DTO
// =============================================================================

export const CreateGiftDtoSchema = z.object({
  walletItemId: z.string().uuid(),
  transferAmount: z.number().int().positive().default(1),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
  deliveryMethod: GiftDeliveryMethodEnum,
  giftMessage: z.string().max(500).optional(),
});

export type CreateGiftDto = z.infer<typeof CreateGiftDtoSchema>;

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
