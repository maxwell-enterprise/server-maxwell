/**
 * MAXWELL ERP - Zod Enum Schemas
 * Semua ENUM types dalam bentuk Zod schema
 */

import { z } from 'zod';

// =============================================================================
// A. USER & MEMBER ENUMS
// =============================================================================

export const UserRoleEnum = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE',
  'OPERATIONS',
  'FACILITATOR',
  'SALES',
  'MEMBER',
  'GUEST',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const MemberLifecycleStageEnum = z.enum([
  'GUEST',
  'IDENTIFIED',
  'PARTICIPANT',
  'MEMBER',
  'CERTIFIED',
  'FACILITATOR',
]);
export type MemberLifecycleStage = z.infer<typeof MemberLifecycleStageEnum>;

export const IdentityTypeEnum = z.enum([
  'KTP',
  'PASSPORT',
  'SIM',
  'DRIVER_LICENSE',
]);
export type IdentityType = z.infer<typeof IdentityTypeEnum>;

// =============================================================================
// B. EVENT ENUMS
// =============================================================================

export const EventTypeEnum = z.enum([
  'SINGLE',
  'SERIES',
  'CLASS',
  'FESTIVAL',
  'RECURRING',
]);
export type EventType = z.infer<typeof EventTypeEnum>;

export const EventStatusEnum = z.enum([
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
]);
export type EventStatus = z.infer<typeof EventStatusEnum>;

export const RecurringPatternEnum = z.enum([
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);
export type RecurringPattern = z.infer<typeof RecurringPatternEnum>;

// =============================================================================
// C. ACCESS TAG ENUMS
// =============================================================================

export const TagUsageTypeEnum = z.enum(['UNLIMITED', 'CONSUMABLE']);
export type TagUsageType = z.infer<typeof TagUsageTypeEnum>;

export const TagCategoryEnum = z.enum([
  'TICKET',
  'PASS',
  'CREDIT',
  'MEMBERSHIP',
  'ACCESS',
]);
export type TagCategory = z.infer<typeof TagCategoryEnum>;

// =============================================================================
// D. PRODUCT ENUMS
// =============================================================================

export const ProductTypeEnum = z.enum([
  'TICKET',
  'PACKAGE',
  'MERCHANDISE',
  'DIGITAL',
  'SUBSCRIPTION',
  'DONATION',
]);
export type ProductType = z.infer<typeof ProductTypeEnum>;

export const ItemTypeEnum = z.enum(['TICKET', 'PHYSICAL', 'DIGITAL']);
export type ItemType = z.infer<typeof ItemTypeEnum>;

export const StockTypeEnum = z.enum(['PHYSICAL', 'SHARED_EVENT', 'UNLIMITED']);
export type StockType = z.infer<typeof StockTypeEnum>;

export const PricingTierEnum = z.enum([
  'EARLY_BIRD',
  'REGULAR',
  'LAST_MINUTE',
  'VIP',
  'MEMBER_DISCOUNT',
]);
export type PricingTier = z.infer<typeof PricingTierEnum>;

// =============================================================================
// E. TRANSACTION ENUMS
// =============================================================================

export const PaymentStatusEnum = z.enum([
  'PENDING',
  'AWAITING_PAYMENT',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIAL_REFUND',
  'FAILED',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const PaymentMethodEnum = z.enum([
  'BANK_TRANSFER',
  'VIRTUAL_ACCOUNT',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'QRIS',
  'E_WALLET',
  'CASH',
  'INSTALLMENT',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const TransactionTypeEnum = z.enum([
  'SALE',
  'REFUND',
  'ADJUSTMENT',
  'PARTIAL_PAYMENT',
  'GIFT',
]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

// =============================================================================
// F. WALLET ENUMS
// =============================================================================

export const WalletItemStatusEnum = z.enum([
  'ACTIVE',
  'LOCKED',
  'USED',
  'EXPIRED',
  'CANCELLED',
]);
export type WalletItemStatus = z.infer<typeof WalletItemStatusEnum>;

export const WalletTransactionTypeEnum = z.enum([
  'PURCHASE',
  'USAGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'REFUND',
  'ADJUSTMENT',
  'EXPIRY',
]);
export type WalletTransactionType = z.infer<typeof WalletTransactionTypeEnum>;

// =============================================================================
// G. GIFT ENUMS
// =============================================================================

export const GiftStatusEnum = z.enum([
  'PENDING',
  'CLAIMED',
  'REVOKED',
  'EXPIRED',
]);
export type GiftStatus = z.infer<typeof GiftStatusEnum>;

export const GiftDeliveryMethodEnum = z.enum([
  'LINK',
  'EMAIL',
  'WHATSAPP',
  'DIRECT',
]);
export type GiftDeliveryMethod = z.infer<typeof GiftDeliveryMethodEnum>;

// =============================================================================
// H. FINANCE ENUMS
// =============================================================================

export const LedgerEntryTypeEnum = z.enum(['DEBIT', 'CREDIT']);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeEnum>;

export const LedgerAccountTypeEnum = z.enum([
  'REVENUE',
  'RECEIVABLE',
  'PAYABLE',
  'COMMISSION',
  'ROYALTY',
  'REFUND',
  'TAX',
]);
export type LedgerAccountType = z.infer<typeof LedgerAccountTypeEnum>;

// =============================================================================
// I. AUTOMATION ENUMS
// =============================================================================

export const TriggerEventEnum = z.enum([
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'CHECK_IN',
  'CHECK_OUT',
  'REGISTRATION',
  'GIFT_SENT',
  'GIFT_CLAIMED',
  'CERTIFICATE_ISSUED',
  'LEVEL_UP',
  'EVENT_REMINDER',
  'TICKET_EXPIRING',
]);
export type TriggerEvent = z.infer<typeof TriggerEventEnum>;

export const ActionTypeEnum = z.enum([
  'SEND_EMAIL',
  'SEND_WHATSAPP',
  'SEND_PUSH',
  'CREATE_TASK',
  'AWARD_POINTS',
  'UPDATE_STATUS',
  'WEBHOOK',
]);
export type ActionType = z.infer<typeof ActionTypeEnum>;

// =============================================================================
// J. CHECK-IN ENUMS
// =============================================================================

export const CheckinStatusEnum = z.enum([
  'SUCCESS',
  'INVALID_TICKET',
  'WRONG_EVENT',
  'WRONG_GATE',
  'ALREADY_USED',
  'EXPIRED',
  'BLOCKED',
]);
export type CheckinStatus = z.infer<typeof CheckinStatusEnum>;

export const SyncStatusEnum = z.enum(['SYNCED', 'PENDING_SYNC', 'FAILED']);
export type SyncStatus = z.infer<typeof SyncStatusEnum>;
