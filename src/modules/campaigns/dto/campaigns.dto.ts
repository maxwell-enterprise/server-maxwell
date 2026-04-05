import { z } from 'zod';

export const CampaignCategorySchema = z.enum([
  'SOCIAL_MEDIA',
  'EMAIL_BLAST',
  'OFFLINE_EVENT',
  'PODCAST',
  'PARTNER_REFERRAL',
  'OTHER',
]);

const OptionalCampaignFieldsSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(255).optional(),
  sourceCode: z.string().min(1).max(255).optional(),
  category: CampaignCategorySchema.optional(),
  targetProductId: z.string().min(1).max(255).nullable().optional(),
  linkedDiscountCode: z.string().min(1).max(255).nullable().optional(),
  generatedLink: z.string().min(1).max(2000).optional(),
  createdAt: z.string().min(1).optional(),
  clicks: z.coerce.number().int().nonnegative().optional(),
  conversions: z.coerce.number().int().nonnegative().optional(),
  revenue: z.coerce.number().nonnegative().optional(),
});

export const CreateCampaignDtoSchema = OptionalCampaignFieldsSchema.extend({
  name: z.string().min(1).max(255),
  sourceCode: z.string().min(1).max(255),
  category: CampaignCategorySchema.default('OTHER'),
});

export type CreateCampaignDto = z.infer<typeof CreateCampaignDtoSchema>;

export const UpdateCampaignDtoSchema = OptionalCampaignFieldsSchema.refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided',
  },
);

export type UpdateCampaignDto = z.infer<typeof UpdateCampaignDtoSchema>;

export const TrackClickDtoSchema = z.object({
  sourceCode: z.string().min(1).max(255),
});

export type TrackClickDto = z.infer<typeof TrackClickDtoSchema>;

export const TrackConversionDtoSchema = z.object({
  sourceCode: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
});

export type TrackConversionDto = z.infer<typeof TrackConversionDtoSchema>;

export const BulkCampaignsDtoSchema = z.object({
  mode: z.enum(['upsert']).default('upsert'),
  items: z.array(CreateCampaignDtoSchema).default([]),
});

export type BulkCampaignsDto = z.infer<typeof BulkCampaignsDtoSchema>;
