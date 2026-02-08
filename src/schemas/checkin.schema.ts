/**
 * MAXWELL ERP - Check-in & Operations Zod Schemas
 */

import { z } from 'zod';
import { CheckinStatusEnum, SyncStatusEnum } from './enums.schema';

// =============================================================================
// CHECK-IN RECORD SCHEMA
// =============================================================================

export const CheckinRecordSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  tierId: z.string().uuid().nullable().optional(),
  gateId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  walletId: z.string().uuid().nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  scannedQrString: z.string().max(100),
  status: CheckinStatusEnum,
  rejectionReason: z.string().nullable().optional(),
  creditsUsed: z.number().int().default(0),
  checkedInAt: z.coerce.date(),
  checkedOutAt: z.coerce.date().nullable().optional(),
  scannerDeviceId: z.string().max(100).nullable().optional(),
  scannedByUserId: z.string().uuid().nullable().optional(),
  isOfflineEntry: z.boolean().default(false),
  syncStatus: SyncStatusEnum.default('SYNCED'),
  syncedAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export type CheckinRecord = z.infer<typeof CheckinRecordSchema>;

// =============================================================================
// SCAN QR INPUT SCHEMA
// =============================================================================

export const ScanQrSchema = z.object({
  qrString: z.string().min(1),
  eventId: z.string().uuid(),
  gateId: z.string().uuid().optional(),
  tierId: z.string().uuid().optional(),
  deviceId: z.string().optional(),
  offlineEntryId: z.string().optional(),
});

export type ScanQrInput = z.infer<typeof ScanQrSchema>;

// Scan Response
export const ScanResultSchema = z.object({
  success: z.boolean(),
  status: CheckinStatusEnum,
  message: z.string(),
  checkinId: z.string().uuid().optional(),
  user: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      avatarUrl: z.string().nullable(),
      membershipTier: z.string().optional(),
    })
    .optional(),
  ticket: z
    .object({
      tagName: z.string(),
      tierName: z.string().nullable(),
      remainingBalance: z.number().int(),
    })
    .optional(),
  suggestedGate: z.string().optional(), // Jika salah gate
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

// =============================================================================
// SCANNER DEVICE SCHEMA
// =============================================================================

export const ScannerDeviceSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().max(100),
  deviceName: z.string().max(255),
  assignedEventId: z.string().uuid().nullable().optional(),
  assignedGateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  lastSyncAt: z.coerce.date().nullable().optional(),
  registeredAt: z.coerce.date(),
});

export type ScannerDevice = z.infer<typeof ScannerDeviceSchema>;

export const RegisterDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  eventId: z.string().uuid().optional(),
  gateId: z.string().uuid().optional(),
});

export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;

// =============================================================================
// OFFLINE SYNC SCHEMA
// =============================================================================

export const OfflineSyncItemSchema = z.object({
  offlineId: z.string(),
  actionType: z.enum(['CHECKIN', 'CHECKOUT']),
  qrString: z.string(),
  eventId: z.string().uuid(),
  gateId: z.string().uuid().optional(),
  timestamp: z.coerce.date(),
});

export const OfflineSyncBatchSchema = z.object({
  deviceId: z.string(),
  items: z.array(OfflineSyncItemSchema),
});

export type OfflineSyncBatch = z.infer<typeof OfflineSyncBatchSchema>;
