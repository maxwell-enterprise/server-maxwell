/**
 * MAXWELL ERP - Check-in DTOs
 */

import { z } from 'zod';
import { CheckinStatusEnum } from '../../../schemas/enums.schema';

// =============================================================================
// SCAN QR DTO
// =============================================================================

export const ScanQrDtoSchema = z.object({
  qrString: z.string().min(1),
  eventId: z.string().min(1),
  gateId: z.string().min(1).optional(),
  tierId: z.string().min(1).optional(),
  deviceId: z.string().optional(),
  offlineEntryId: z.string().optional(), // For offline sync
});

export type ScanQrDto = z.infer<typeof ScanQrDtoSchema>;

// =============================================================================
// SCAN RESULT DTO
// =============================================================================

export const ScanResultDtoSchema = z.object({
  success: z.boolean(),
  status: CheckinStatusEnum,
  message: z.string(),
  checkinId: z.string().optional(),
  verificationCode: z.string().optional(),
  eventColor: z.string().optional(),
  scannedAt: z.string().optional(),
  user: z
    .object({
      id: z.string(),
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
  suggestedGate: z.string().optional(),
});

export type ScanResultDto = z.infer<typeof ScanResultDtoSchema>;

// =============================================================================
// REGISTER DEVICE DTO
// =============================================================================

export const RegisterDeviceDtoSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  eventId: z.string().optional(),
  gateId: z.string().optional(),
});

export type RegisterDeviceDto = z.infer<typeof RegisterDeviceDtoSchema>;

// =============================================================================
// OFFLINE SYNC DTO
// =============================================================================

export const OfflineSyncItemDtoSchema = z.object({
  offlineId: z.string(),
  actionType: z.enum(['CHECKIN', 'CHECKOUT']),
  qrString: z.string(),
  eventId: z.string().min(1),
  gateId: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const OfflineSyncBatchDtoSchema = z.object({
  deviceId: z.string(),
  items: z.array(OfflineSyncItemDtoSchema),
});

export type OfflineSyncBatchDto = z.infer<typeof OfflineSyncBatchDtoSchema>;

// =============================================================================
// CHECKIN QUERY DTO
// =============================================================================

export const CheckinQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  eventId: z.string().optional(),
  gateId: z.string().optional(),
  status: CheckinStatusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type CheckinQueryDto = z.infer<typeof CheckinQueryDtoSchema>;

export const ManualCheckinDtoSchema = z.object({
  memberId: z.string().min(1),
  eventId: z.string().min(1),
  method: z.enum(['SELF_SCAN', 'ADMIN_OVERRIDE']).default('SELF_SCAN'),
});

export type ManualCheckinDto = z.infer<typeof ManualCheckinDtoSchema>;
