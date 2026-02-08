/**
 * MAXWELL ERP - Check-in Entities
 */

export class CheckinRecord {
  id: string;
  eventId: string;
  tierId?: string | null;
  gateId?: string | null;
  userId?: string | null;
  walletId?: string | null;
  tagId?: string | null;
  scannedQrString: string;
  status: string;
  rejectionReason?: string | null;
  creditsUsed: number;
  checkedInAt: Date;
  checkedOutAt?: Date | null;
  scannerDeviceId?: string | null;
  scannedByUserId?: string | null;
  isOfflineEntry: boolean;
  syncStatus: string;
  syncedAt?: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class ScannerDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  assignedEventId?: string | null;
  assignedGateId?: string | null;
  isActive: boolean;
  lastSyncAt?: Date | null;
  registeredAt: Date;
}
