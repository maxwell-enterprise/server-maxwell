import { z } from 'zod';

export const QuestionTypeSchema = z.enum([
  'SHORT_ANSWER',
  'MULTIPLE_CHOICE',
  'CHECKBOX',
  'DROPDOWN',
  'LINEAR_SCALE',
  'DATE',
  'TIME',
]);

export const DataSourceSchema = z.enum(['CUSTOM', 'PRODUCTS', 'EVENTS']);

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  text: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  dataSource: DataSourceSchema.optional(),
  dataSourceFilter: z.array(z.string()).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  points: z.number().int().min(0).optional(),
  scaleConfig: z
    .object({
      min: z.number(),
      max: z.number(),
      minLabel: z.string().optional(),
      maxLabel: z.string().optional(),
    })
    .optional(),
});

export const UpsertFormDtoSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  isQuiz: z.boolean().default(false),
  questions: z.array(QuestionSchema).default([]),
  successMessage: z.string().max(2000).optional(),
  active: z.boolean().default(true),
});

export const CreateDeploymentDtoSchema = z.object({
  name: z.string().min(1).max(500),
  eventId: z.string().max(200).optional().nullable(),
});

export const GuestContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(50),
});

export const SubmitFormResponseDtoSchema = z.object({
  formId: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  answers: z.record(z.string(), z.unknown()),
  guestContact: GuestContactSchema.optional(),
});

export type QuestionDto = z.infer<typeof QuestionSchema>;
export type UpsertFormDto = z.infer<typeof UpsertFormDtoSchema>;
export type CreateDeploymentDto = z.infer<typeof CreateDeploymentDtoSchema>;
export type SubmitFormResponseDto = z.infer<typeof SubmitFormResponseDtoSchema>;
