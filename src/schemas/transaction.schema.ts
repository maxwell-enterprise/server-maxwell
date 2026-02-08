/**
 * MAXWELL ERP - Transaction & Finance Zod Schemas
 */

import { z } from 'zod';
import {
  PaymentStatusEnum,
  PaymentMethodEnum,
  TransactionTypeEnum,
  ProductTypeEnum,
  LedgerEntryTypeEnum,
  LedgerAccountTypeEnum,
} from './enums.schema';

// =============================================================================
// TRANSACTION SCHEMA
// =============================================================================

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  transactionNumber: z.string().max(50),
  userId: z.string().uuid().nullable().optional(),
  guestEmail: z.string().email().nullable().optional(),
  guestName: z.string().max(255).nullable().optional(),
  guestPhone: z.string().max(20).nullable().optional(),
  subtotalAmount: z.number().positive(),
  discountAmount: z.number().default(0),
  taxAmount: z.number().default(0),
  totalAmount: z.number().positive(),
  paymentStatus: PaymentStatusEnum.default('PENDING'),
  paymentMethod: PaymentMethodEnum.nullable().optional(),
  paidAmount: z.number().default(0),
  paidAt: z.coerce.date().nullable().optional(),
  midtransOrderId: z.string().max(100).nullable().optional(),
  midtransTransactionId: z.string().max(100).nullable().optional(),
  midtransPaymentType: z.string().max(50).nullable().optional(),
  midtransVaNumber: z.string().max(50).nullable().optional(),
  midtransQrString: z.string().nullable().optional(),
  midtransRedirectUrl: z.string().url().nullable().optional(),
  midtransResponse: z.record(z.string(), z.unknown()).default({}),
  paymentExpiresAt: z.coerce.date().nullable().optional(),
  voucherId: z.string().uuid().nullable().optional(),
  voucherCode: z.string().max(50).nullable().optional(),
  type: TransactionTypeEnum.default('SALE'),
  originalTransactionId: z.string().uuid().nullable().optional(),
  entitlementProcessed: z.boolean().default(false),
  entitlementProcessedAt: z.coerce.date().nullable().optional(),
  referrerUserId: z.string().uuid().nullable().optional(),
  salesUserId: z.string().uuid().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  customerNotes: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// =============================================================================
// TRANSACTION ITEM SCHEMA
// =============================================================================

export const TransactionItemSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().max(255),
  productType: ProductTypeEnum,
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountAmount: z.number().default(0),
  totalPrice: z.number().positive(),
  pricingTierId: z.string().uuid().nullable().optional(),
  pricingTierName: z.string().max(100).nullable().optional(),
  entitlementProcessed: z.boolean().default(false),
  createdAt: z.coerce.date(),
});

export type TransactionItem = z.infer<typeof TransactionItemSchema>;

// =============================================================================
// CHECKOUT INPUT SCHEMA
// =============================================================================

export const CheckoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  pricingTierId: z.string().uuid().optional(),
});

export const CheckoutSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  voucherCode: z.string().optional(),
  paymentMethod: PaymentMethodEnum,
  customerNotes: z.string().max(500).optional(),
  // Guest checkout fields
  guestEmail: z.string().email().optional(),
  guestName: z.string().max(255).optional(),
  guestPhone: z.string().max(20).optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

// =============================================================================
// MIDTRANS WEBHOOK SCHEMA
// =============================================================================

export const MidtransWebhookSchema = z.object({
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

export type MidtransWebhook = z.infer<typeof MidtransWebhookSchema>;

// =============================================================================
// REFUND SCHEMA
// =============================================================================

export const RefundSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  refundAmount: z.number().positive(),
  reasonCode: z.string().max(50).nullable().optional(),
  reasonText: z.string().nullable().optional(),
  status: z
    .enum(['PENDING', 'APPROVED', 'PROCESSED', 'REJECTED'])
    .default('PENDING'),
  bankName: z.string().max(100).nullable().optional(),
  accountNumber: z.string().max(50).nullable().optional(),
  accountHolder: z.string().max(255).nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.coerce.date().nullable().optional(),
  processedAt: z.coerce.date().nullable().optional(),
  walletItemsReverted: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type Refund = z.infer<typeof RefundSchema>;

export const CreateRefundSchema = z.object({
  transactionId: z.string().uuid(),
  refundAmount: z.number().positive(),
  reasonCode: z.string().optional(),
  reasonText: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountHolder: z.string().optional(),
});

export type CreateRefundInput = z.infer<typeof CreateRefundSchema>;

// =============================================================================
// FINANCE LEDGER SCHEMA
// =============================================================================

export const FinanceLedgerSchema = z.object({
  id: z.string().uuid(),
  entryDate: z.coerce.date(),
  entryType: LedgerEntryTypeEnum,
  accountType: LedgerAccountTypeEnum,
  amount: z.number().positive(),
  description: z.string(),
  referenceType: z.string().max(50).nullable().optional(),
  referenceId: z.string().uuid().nullable().optional(),
  relatedUserId: z.string().uuid().nullable().optional(),
  pairedEntryId: z.string().uuid().nullable().optional(),
  isReconciled: z.boolean().default(false),
  reconciledAt: z.coerce.date().nullable().optional(),
  reconciledBy: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type FinanceLedger = z.infer<typeof FinanceLedgerSchema>;
