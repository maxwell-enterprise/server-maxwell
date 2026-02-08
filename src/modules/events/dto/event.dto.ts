/**
 * MAXWELL ERP - Event DTOs
 */

import { z } from 'zod';
import {
  EventTypeEnum,
  EventStatusEnum,
  RecurringPatternEnum,
  TagUsageTypeEnum,
  TagCategoryEnum,
} from '../../../schemas/enums.schema';

// =============================================================================
// CREATE EVENT DTO
// =============================================================================

export const CreateEventDtoSchema = z
  .object({
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    shortDescription: z.string().max(500).optional(),
    type: EventTypeEnum,
    parentEventId: z.string().uuid().optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    timezone: z.string().default('Asia/Jakarta'),
    recurringPattern: RecurringPatternEnum.optional(),
    recurringEndDate: z.coerce.date().optional(),
    locationName: z.string().max(255).optional(),
    locationAddress: z.string().optional(),
    locationCity: z.string().max(100).optional(),
    locationMapsUrl: z.string().url().optional(),
    isOnline: z.boolean().default(false),
    onlineMeetingUrl: z.string().url().optional(),
    totalCapacity: z.number().int().positive().optional(),
    bannerUrl: z.string().url().optional(),
    thumbnailUrl: z.string().url().optional(),
    isPublic: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    registrationStartAt: z.coerce.date().optional(),
    registrationEndAt: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export type CreateEventDto = z.infer<typeof CreateEventDtoSchema>;

// =============================================================================
// UPDATE EVENT DTO
// =============================================================================

export const UpdateEventDtoSchema = CreateEventDtoSchema.partial();
export type UpdateEventDto = z.infer<typeof UpdateEventDtoSchema>;

// =============================================================================
// EVENT QUERY DTO
// =============================================================================

export const EventQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type: EventTypeEnum.optional(),
  status: EventStatusEnum.optional(),
  isPublic: z.coerce.boolean().optional(),
  startFrom: z.coerce.date().optional(),
  startTo: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'startTime', 'name']).default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type EventQueryDto = z.infer<typeof EventQueryDtoSchema>;

// =============================================================================
// CREATE ACCESS TAG DTO
// =============================================================================

export const CreateAccessTagDtoSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  usageType: TagUsageTypeEnum,
  category: TagCategoryEnum,
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  iconUrl: z.string().url().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

export type CreateAccessTagDto = z.infer<typeof CreateAccessTagDtoSchema>;

// =============================================================================
// CREATE ACCESS RULE DTO
// =============================================================================

export const CreateAccessRuleDtoSchema = z.object({
  eventId: z.string().uuid(),
  tagId: z.string().uuid(),
  tierId: z.string().uuid().optional(),
  usageAmount: z.number().int().positive().default(1),
  priority: z.number().int().default(0),
});

export type CreateAccessRuleDto = z.infer<typeof CreateAccessRuleDtoSchema>;

// =============================================================================
// CREATE TIER DTO
// =============================================================================

export const CreateTierDtoSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  benefits: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

export type CreateTierDto = z.infer<typeof CreateTierDtoSchema>;

// =============================================================================
// CREATE GATE DTO
// =============================================================================

export const CreateGateDtoSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  locationHint: z.string().optional(),
  allowedTierIds: z.array(z.string().uuid()).default([]),
});

export type CreateGateDto = z.infer<typeof CreateGateDtoSchema>;
