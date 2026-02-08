/**
 * MAXWELL ERP - Automation & Common Zod Schemas
 */

import { z } from 'zod';
import { TriggerEventEnum, ActionTypeEnum } from './enums.schema';

// =============================================================================
// AUTOMATION RULE SCHEMA
// =============================================================================

export const AutomationRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  triggerEvent: TriggerEventEnum,
  conditions: z.record(z.string(), z.unknown()).default({}),
  actionType: ActionTypeEnum,
  actionConfig: z.record(z.string(), z.unknown()),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type AutomationRule = z.infer<typeof AutomationRuleSchema>;

export const CreateAutomationRuleSchema = AutomationRuleSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateAutomationRuleInput = z.infer<
  typeof CreateAutomationRuleSchema
>;

// =============================================================================
// CERTIFICATE SCHEMA
// =============================================================================

export const CertificateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  certificateType: z.string().max(100),
  certificateNumber: z.string().max(100),
  title: z.string().max(255),
  issuedAt: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
  certificateUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export type Certificate = z.infer<typeof CertificateSchema>;

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

// Pagination
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

// Paginated Response
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
      hasNextPage: z.boolean(),
      hasPrevPage: z.boolean(),
    }),
  });

// UUID Param
export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

// Date Range Filter
export const DateRangeSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    { message: 'End date must be after start date' },
  );

// API Response
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  });

// Error Response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
