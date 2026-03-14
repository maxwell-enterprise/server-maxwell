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

export class WalletItemContract {
  id: string;
  userId: string;
  type: string;
  title: string;
  subtitle: string;
  expiryDate?: string | null;
  qrData?: string | null;
  status: string;
  isTransferable: boolean;
  sponsoredBy?: string | null;
  meta: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt: string | Date;
}

export class WalletTransaction {
  id: string;
  walletItemId: string;
  userId: string;
  transactionType: string;
  amountChange: number;
  balanceAfter: number;
  referenceId?: string | null;
  referenceName?: string | null;
  timestamp: string | Date;
}

export class GiftAllocation {
  id: string;
  sourceUserId: string;
  sourceUserName: string;
  entitlementId: string;
  itemName: string;
  targetEmail?: string | null;
  claimToken: string;
  status: string;
  claimedByUserId?: string | null;
  claimedAt?: string | Date | null;
  createdAt?: string | Date;
  tokenExpiresAt?: Date | null;
  senderUserId?: string | null;
  walletItemId?: string | null;
  transferAmount?: number | null;
}

export class UserEntitlementsContract {
  userId: string;
  permissions: string[];
  attributes: Record<string, unknown>;
  credits: number;
}

export class CorporateTeamMemberContract {
  id: string;
  orgId?: string;
  email: string;
  name: string;
  status: string;
  joinedAt?: string | Date | null;
  lastActive?: string | Date | null;
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
