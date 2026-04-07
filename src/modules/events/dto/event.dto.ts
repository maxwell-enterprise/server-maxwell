import { z } from 'zod';
import {
  TagCategoryEnum,
  TagUsageTypeEnum,
} from '../../../schemas/enums.schema';

const EventTypeEnum = z.enum(['SOLO', 'CONTAINER', 'SESSION']);
const EventStatusEnum = z.enum(['Upcoming', 'Completed', 'Cancelled']);
const LocationModeEnum = z.enum(['OFFLINE', 'ONLINE', 'HYBRID']);
const AdmissionPolicyEnum = z.enum([
  'PRE_BOOKED',
  'OPEN_MEMBER',
  'OPEN_PUBLIC',
  'ON_SITE_DEDUCTION',
  'INVITED_ONLY',
]);

const EventTierDefinitionDtoSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  masterCode: z.string().max(120).optional(),
  quota: z.coerce.number().int().nonnegative(),
  quotaSold: z.coerce.number().int().nonnegative().optional(),
  price: z.coerce.number().nonnegative().optional(),
  grantTagIds: z.array(z.string()).default([]),
  bundledTiers: z
    .array(
      z.object({
        eventId: z.string().min(1).max(120),
        eventName: z.string().min(1).max(255),
        tierId: z.string().min(1).max(120),
        tierName: z.string().min(1).max(255),
      }),
    )
    .optional(),
});

const EventGateConfigDtoSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  allowedTiers: z.array(z.string()).default([]),
  assignedUserIds: z.array(z.string()).default([]),
  isActive: z.boolean(),
});

const EventSelectionConfigDtoSchema = z.object({
  mode: z.enum(['BUNDLE', 'OPTION']),
  minSelect: z.coerce.number().int().positive(),
  maxSelect: z.coerce.number().int().positive(),
});

const OperationalSessionDtoSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  startTime: z.string().min(1).max(120),
  endTime: z.string().min(1).max(120),
});

const RecurringMetaDtoSchema = z.object({
  frequency: z.string().min(1).max(100),
  patternDescription: z.string().default(''),
  time: z.string().min(1).max(50),
  totalSessions: z.coerce.number().int().positive(),
});

const EventShape = {
  id: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(255),
  date: z.string().min(1).max(20),
  endDate: z.string().max(20).optional(),
  time: z.string().max(50).optional(),
  location: z.string().max(255).default('TBD'),
  locationMode: LocationModeEnum.default('OFFLINE'),
  onlineMeetingLink: z.string().max(2048).optional(),
  locationMapLink: z.string().max(2048).optional(),
  banner_url: z.string().max(2048).optional(),
  description: z.string().max(5000).optional().default(''),
  capacity: z.coerce.number().int().nonnegative().default(0),
  attendees: z.coerce.number().int().nonnegative().default(0),
  revenue: z.coerce.number().nonnegative().default(0),
  status: EventStatusEnum.default('Upcoming'),
  isVisibleInCatalog: z.boolean().default(true),
  type: EventTypeEnum,
  parentEventId: z.string().max(120).optional(),
  classId: z.string().max(120).optional(),
  admissionPolicy: AdmissionPolicyEnum.default('PRE_BOOKED'),
  creditTags: z.array(z.string()).default([]),
  doneTag: z.string().max(120).optional(),
  isRecurring: z.boolean().default(false),
  recurringMeta: RecurringMetaDtoSchema.optional(),
  selectionConfig: EventSelectionConfigDtoSchema.optional(),
  gates: z.array(EventGateConfigDtoSchema).optional(),
  tiers: z.array(EventTierDefinitionDtoSchema).optional(),
  sessions: z.array(OperationalSessionDtoSchema).optional(),
};

export const CreateEventDtoSchema = z.object(EventShape);
export type CreateEventDto = z.infer<typeof CreateEventDtoSchema>;

export const UpdateEventDtoSchema = z
  .object({
    ...EventShape,
    id: z.string().min(1).max(120).optional(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateEventDto = z.infer<typeof UpdateEventDtoSchema>;

export const EventResponseDtoSchema = z.object({
  ...EventShape,
  id: z.string().min(1).max(120),
});
export type EventResponseDto = z.infer<typeof EventResponseDtoSchema>;

export const EventQueryDtoSchema = z.object({
  search: z.string().optional(),
  type: EventTypeEnum.optional(),
  status: EventStatusEnum.optional(),
  isVisibleInCatalog: z.coerce.boolean().optional(),
  parentEventId: z.string().optional(),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  sortBy: z.enum(['date', 'name', 'createdAt']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type EventQueryDto = z.infer<typeof EventQueryDtoSchema>;

export const CreateAccessTagDtoSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  usageType: TagUsageTypeEnum.default('UNLIMITED'),
  category: TagCategoryEnum.default('ACCESS'),
  usageLimit: z.coerce.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  iconUrl: z.string().url().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});
export type CreateAccessTagDto = z.infer<typeof CreateAccessTagDtoSchema>;

export const UpdateAccessTagDtoSchema =
  CreateAccessTagDtoSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );
export type UpdateAccessTagDto = z.infer<typeof UpdateAccessTagDtoSchema>;

export const CreateAccessRuleDtoSchema = z.object({
  eventId: z.string().min(1).max(120),
  tagId: z.string().min(1).max(120),
  tierId: z.string().max(120).optional(),
  usageAmount: z.coerce.number().int().positive().default(1),
  priority: z.coerce.number().int().default(0),
});
export type CreateAccessRuleDto = z.infer<typeof CreateAccessRuleDtoSchema>;

export const CreateTierDtoSchema = EventTierDefinitionDtoSchema.extend({
  quotaSold: z.coerce.number().int().nonnegative().optional(),
});
export type CreateTierDto = z.infer<typeof CreateTierDtoSchema>;

export const CreateGateDtoSchema = EventGateConfigDtoSchema;
export type CreateGateDto = z.infer<typeof CreateGateDtoSchema>;
