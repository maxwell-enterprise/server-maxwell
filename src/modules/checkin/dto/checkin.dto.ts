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
  eventId: z.string().uuid(),
  gateId: z.string().uuid().optional(),
  tierId: z.string().uuid().optional(),
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
  suggestedGate: z.string().optional(),
});

export type ScanResultDto = z.infer<typeof ScanResultDtoSchema>;

// =============================================================================
// REGISTER DEVICE DTO
// =============================================================================

export const RegisterDeviceDtoSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  eventId: z.string().uuid().optional(),
  gateId: z.string().uuid().optional(),
});

export type RegisterDeviceDto = z.infer<typeof RegisterDeviceDtoSchema>;

// =============================================================================
// OFFLINE SYNC DTO
// =============================================================================

export const OfflineSyncItemDtoSchema = z.object({
  offlineId: z.string(),
  actionType: z.enum(['CHECKIN', 'CHECKOUT']),
  qrString: z.string(),
  eventId: z.string().uuid(),
  gateId: z.string().uuid().optional(),
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
  eventId: z.string().uuid().optional(),
  gateId: z.string().uuid().optional(),
  status: CheckinStatusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type CheckinQueryDto = z.infer<typeof CheckinQueryDtoSchema>;
