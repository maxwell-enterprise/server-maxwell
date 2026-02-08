/**
 * MAXWELL ERP - Wallet Entities
 */

export class MemberWallet {
  id: string;
  userId: string;
  tagId: string;
  initialBalance: number;
  balance: number;
  status: string;
  uniqueQrString: string;
  qrGeneratedAt: Date;
  validFrom: Date;
  validUntil?: Date | null;
  sourceType: string;
  sourceTransactionId?: string | null;
  sponsorUserId?: string | null;
  isGift: boolean;
  lockedAt?: Date | null;
  lockedReason?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class WalletTransaction {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  eventId?: string | null;
  relatedUserId?: string | null;
  notes?: string | null;
  performedBy?: string | null;
  createdAt: Date;
}

export class GiftAllocation {
  id: string;
  token: string;
  tokenExpiresAt: Date;
  senderUserId: string;
  walletItemId: string;
  transferAmount: number;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientUserId?: string | null;
  deliveryMethod: string;
  deliverySentAt?: Date | null;
  giftMessage?: string | null;
  status: string;
  claimedAt?: Date | null;
  revokedAt?: Date | null;
  revokeReason?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class MembershipCard {
  id: string;
  userId: string;
  cardNumber: string;
  qrString: string;
  membershipTier: string;
  tierUpdatedAt: Date;
  validFrom: Date;
  validUntil?: Date | null;
  isLifetime: boolean;
  cardDesignTemplate: string;
  customDesignUrl?: string | null;
  totalEventsAttended: number;
  totalPointsEarned: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
