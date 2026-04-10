/**
 * MAXWELL ERP - Transaction DTOs
 */

import { z } from 'zod';
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '../../../schemas/enums.schema';

// =============================================================================
// CHECKOUT DTO
// =============================================================================

export const CheckoutItemDtoSchema = z.object({
  // FE saat ini bisa mengirim `public_id` (bukan UUID id internal).
  // BE akan tetap menilai valid via query `coalesce(public_id, id::text)`.
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  /** When set, unit price is taken from `products.variants[]` (multi-tier products). */
  variantId: z.string().trim().min(1).max(120).optional(),
  pricingTierId: z.string().uuid().optional(),
});

export const CheckoutDtoSchema = z.object({
  items: z.array(CheckoutItemDtoSchema).min(1),
  voucherCode: z.string().optional(),
  paymentMethod: PaymentMethodEnum,
  customerNotes: z.string().max(500).optional(),
  attributionSource: z.string().trim().min(1).max(120).optional(),
  // Guest checkout
  guestEmail: z.string().email().optional(),
  guestName: z.string().max(255).optional(),
  guestPhone: z.string().max(20).optional(),
});

export type CheckoutDto = z.infer<typeof CheckoutDtoSchema>;

// =============================================================================
// TRANSACTION QUERY DTO
// =============================================================================

export const TransactionQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: PaymentStatusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().optional(), // Search by transaction number
  sortBy: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type TransactionQueryDto = z.infer<typeof TransactionQueryDtoSchema>;

// =============================================================================
// CREATE REFUND DTO
// =============================================================================

export const CreateRefundDtoSchema = z.object({
  transactionId: z.string().uuid(),
  refundAmount: z.number().positive(),
  reasonCode: z.string().optional(),
  reasonText: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountHolder: z.string().optional(),
});

export type CreateRefundDto = z.infer<typeof CreateRefundDtoSchema>;

// =============================================================================
// MIDTRANS WEBHOOK DTO
// =============================================================================

export const MidtransWebhookDtoSchema = z.object({
  transaction_time: z.string(),
  transaction_status: z.string(),
  transaction_id: z.string(),
  status_message: z.string(),
  status_code: z.string(),
  signature_key: z.string(),
  order_id: z.string(),
  merchant_id: z.string(),
  gross_amount: z.string(),
  fraud_status: z.string().optional(),
  payment_type: z.string(),
  va_numbers: z
    .array(
      z.object({
        va_number: z.string(),
        bank: z.string(),
      }),
    )
    .optional(),
});

export type MidtransWebhookDto = z.infer<typeof MidtransWebhookDtoSchema>;

// =============================================================================
// PUBLIC STATUS CHECK DTO (guest-safe polling)
// =============================================================================

export const PublicTransactionStatusDtoSchema = z.object({
  transactionId: z.string().uuid(),
  customerEmail: z.string().email(),
});

export type PublicTransactionStatusDto = z.infer<
  typeof PublicTransactionStatusDtoSchema
>;

// =============================================================================
// SIMULATE SETTLE (testing; requires ALLOW_PAYMENT_SIMULATION on server)
// =============================================================================

export const SimulatePaymentSettleDtoSchema = z.object({
  transactionId: z.string().uuid(),
  customerEmail: z.string().email(),
});

export type SimulatePaymentSettleDto = z.infer<
  typeof SimulatePaymentSettleDtoSchema
>;
