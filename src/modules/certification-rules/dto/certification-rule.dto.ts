import { z } from 'zod';

export const CertificationLogicEnum = z.enum([
  'REQUIRE_ALL',
  'REQUIRE_ANY',
  'MIN_COUNT',
]);

export type CertificationLogic = z.infer<typeof CertificationLogicEnum>;

export const CreateCertificationRuleDtoSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(10000).optional().default(''),
  logic: CertificationLogicEnum,
  requiredTags: z.array(z.string()).default([]),
  minCountValue: z.coerce.number().int().positive().optional(),
  badgeUrl: z.string().max(2000).optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  validityPeriodMonths: z.coerce.number().int().nonnegative().optional(),
});

export type CreateCertificationRuleDto = z.infer<
  typeof CreateCertificationRuleDtoSchema
>;

export const UpdateCertificationRuleDtoSchema =
  CreateCertificationRuleDtoSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' },
  );

export type UpdateCertificationRuleDto = z.infer<
  typeof UpdateCertificationRuleDtoSchema
>;

export const CertificationRuleQueryDtoSchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CertificationRuleQueryDto = z.infer<
  typeof CertificationRuleQueryDtoSchema
>;
