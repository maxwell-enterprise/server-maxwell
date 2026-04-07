import { z } from 'zod';

export const CreateMasterTierDtoSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  basePriceIdr: z.number().nonnegative().optional(),
});

export type CreateMasterTierDto = z.infer<typeof CreateMasterTierDtoSchema>;

export const UpdateMasterTierDtoSchema = CreateMasterTierDtoSchema.partial();

export type UpdateMasterTierDto = z.infer<typeof UpdateMasterTierDtoSchema>;

export const MasterTierQueryDtoSchema = z.object({
  search: z.string().optional(),
});

export type MasterTierQueryDto = z.infer<typeof MasterTierQueryDtoSchema>;
