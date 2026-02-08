/**
 * MAXWELL ERP - Event & Access Tag Zod Schemas (The Lock & Key)
 */

import { z } from 'zod';
import {
  EventTypeEnum,
  EventStatusEnum,
  RecurringPatternEnum,
  TagUsageTypeEnum,
  TagCategoryEnum,
} from './enums.schema';

// =============================================================================
// MASTER EVENT SCHEMA (The Lock/Gembok)
// =============================================================================

export const MasterEventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  type: EventTypeEnum,
  parentEventId: z.string().uuid().nullable().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  timezone: z.string().default('Asia/Jakarta'),
  recurringPattern: RecurringPatternEnum.nullable().optional(),
  recurringEndDate: z.coerce.date().nullable().optional(),
  recurringExceptions: z.array(z.coerce.date()).default([]),
  locationName: z.string().max(255).nullable().optional(),
  locationAddress: z.string().nullable().optional(),
  locationCity: z.string().max(100).nullable().optional(),
  locationMapsUrl: z.string().url().nullable().optional(),
  isOnline: z.boolean().default(false),
  onlineMeetingUrl: z.string().url().nullable().optional(),
  totalCapacity: z.number().int().positive().nullable().optional(),
  currentAttendees: z.number().int().default(0),
  bannerUrl: z.string().url().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  galleryUrls: z.array(z.string().url()).default([]),
  status: EventStatusEnum.default('DRAFT'),
  isPublic: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  registrationStartAt: z.coerce.date().nullable().optional(),
  registrationEndAt: z.coerce.date().nullable().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type MasterEvent = z.infer<typeof MasterEventSchema>;

export const CreateEventSchema = MasterEventSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentAttendees: true,
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.partial();
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

// =============================================================================
// EVENT TIER SCHEMA
// =============================================================================

export const EventTierSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  currentAttendees: z.number().int().default(0),
  benefits: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  createdAt: z.coerce.date(),
});

export type EventTier = z.infer<typeof EventTierSchema>;

export const CreateEventTierSchema = EventTierSchema.omit({
  id: true,
  createdAt: true,
  currentAttendees: true,
});

export type CreateEventTierInput = z.infer<typeof CreateEventTierSchema>;

// =============================================================================
// EVENT GATE SCHEMA
// =============================================================================

export const EventGateSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  locationHint: z.string().nullable().optional(),
  allowedTierIds: z.array(z.string().uuid()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});

export type EventGate = z.infer<typeof EventGateSchema>;

// =============================================================================
// MASTER ACCESS TAG SCHEMA (The Key/Kunci)
// =============================================================================

export const MasterAccessTagSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  usageType: TagUsageTypeEnum,
  category: TagCategoryEnum,
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type MasterAccessTag = z.infer<typeof MasterAccessTagSchema>;

export const CreateAccessTagSchema = MasterAccessTagSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateAccessTagInput = z.infer<typeof CreateAccessTagSchema>;

// =============================================================================
// EVENT ACCESS RULE SCHEMA (Lock ↔ Key Mapping)
// =============================================================================

export const EventAccessRuleSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  tagId: z.string().uuid(),
  tierId: z.string().uuid().nullable().optional(),
  usageAmount: z.number().int().positive().default(1),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});

export type EventAccessRule = z.infer<typeof EventAccessRuleSchema>;

export const CreateEventAccessRuleSchema = EventAccessRuleSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateEventAccessRuleInput = z.infer<
  typeof CreateEventAccessRuleSchema
>;
