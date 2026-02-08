/**
 * MAXWELL ERP - Transaction Entities
 */

export class Transaction {
  id: string;
  transactionNumber: string;
  userId?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  paidAmount: number;
  paidAt?: Date | null;
  midtransOrderId?: string | null;
  midtransTransactionId?: string | null;
  midtransPaymentType?: string | null;
  midtransVaNumber?: string | null;
  midtransQrString?: string | null;
  midtransRedirectUrl?: string | null;
  midtransResponse: Record<string, unknown>;
  paymentExpiresAt?: Date | null;
  voucherId?: string | null;
  voucherCode?: string | null;
  type: string;
  originalTransactionId?: string | null;
  entitlementProcessed: boolean;
  entitlementProcessedAt?: Date | null;
  referrerUserId?: string | null;
  salesUserId?: string | null;
  internalNotes?: string | null;
  customerNotes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  productType: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  pricingTierId?: string | null;
  pricingTierName?: string | null;
  entitlementProcessed: boolean;
  createdAt: Date;
}

export class Refund {
  id: string;
  transactionId: string;
  refundAmount: number;
  reasonCode?: string | null;
  reasonText?: string | null;
  status: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  processedAt?: Date | null;
  walletItemsReverted: string[];
  notes?: string | null;
  createdAt: Date;
}
