import { z } from 'zod';

const MasterDoneTagCategoryEnum = z.enum(['CORE', 'ELECTIVE', 'SPECIAL']);

export const CreateMasterDoneTagDtoSchema = z.object({
  code: z.string().min(1).max(120),
  label: z.string().min(1).max(255),
  category: MasterDoneTagCategoryEnum.default('CORE'),
  description: z.string().optional(),
});

export type CreateMasterDoneTagDto = z.infer<typeof CreateMasterDoneTagDtoSchema>;

export const UpdateMasterDoneTagDtoSchema =
  CreateMasterDoneTagDtoSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateMasterDoneTagDto = z.infer<typeof UpdateMasterDoneTagDtoSchema>;

export const MasterDoneTagQueryDtoSchema = z.object({
  search: z.string().optional(),
});

export type MasterDoneTagQueryDto = z.infer<typeof MasterDoneTagQueryDtoSchema>;
