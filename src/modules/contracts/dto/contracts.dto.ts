import { z } from 'zod';

export const ClauseItemDtoSchema = z.object({
  id: z.string(),
  section: z.string(),
  title: z.string(),
  text: z.string(),
  tags: z.array(z.string()).optional(),
});

export type ClauseItemDto = z.infer<typeof ClauseItemDtoSchema>;

export const BulkClausesDtoSchema = z.object({
  items: z.array(ClauseItemDtoSchema),
});

export type BulkClausesDto = z.infer<typeof BulkClausesDtoSchema>;

/** Full template/instance payloads from FE — id required, rest passthrough */
export const ContractTemplateDocSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export const ContractInstanceDocSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export const PatchContractInstanceSchema = z
  .object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'SIGNED']).optional(),
    signedAt: z.string().optional(),
    signatureUrl: z.string().optional(),
  })
  .refine(
    (o) =>
      o.status !== undefined ||
      o.signedAt !== undefined ||
      o.signatureUrl !== undefined,
    { message: 'At least one of status, signedAt, signatureUrl is required' },
  );

export type PatchContractInstanceDto = z.infer<
  typeof PatchContractInstanceSchema
>;
