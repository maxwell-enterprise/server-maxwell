import { z } from 'zod';
import { MemberLifecycleStageEnum } from '../../../schemas/enums.schema';

export const MemberAddressDtoSchema = z.object({
  street: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

export const SocialProfileDtoSchema = z.object({
  igVerified: z.boolean().default(false),
  igFollowers: z.coerce.number().int().nonnegative().default(0),
  businessAccounts: z.array(z.string()).default([]),
  occupation: z.string().default(''),
  businessType: z.string().default(''),
  communities: z.array(z.string()).default([]),
});

export const MemberEngagementDtoSchema = z.object({
  lastActiveDate: z.string().min(1),
  eventsAttendedCount: z.coerce.number().int().nonnegative().default(0),
  contentCompletionRate: z.coerce.number().nonnegative().default(0),
  communityReputationScore: z.coerce.number().nonnegative().default(0),
  leadScore: z.coerce.number().nonnegative().default(0),
});

const createMemberShape = {
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(50).default(''),
  category: z.string().max(100).default(''),
  scholarship: z.boolean().default(false),
  joinMonth: z.string().min(1).max(20),
  program: z.string().max(255).default(''),
  mentorshipDuration: z.coerce.number().int().min(0).default(0),
  nTagStatus: z.string().max(100).default(''),
  platform: z.string().max(100).default(''),
  regInUS: z.boolean().default(false),
  lifecycleStage: MemberLifecycleStageEnum.default('GUEST'),
  company: z.string().max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  industry: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]),
  address: MemberAddressDtoSchema.optional(),
  socialProfile: SocialProfileDtoSchema.optional(),
  birthDate: z.string().max(50).optional(),
  gender: z.string().max(50).optional(),
  linkedinUrl: z.string().max(500).optional(),
  serviceLevel: z.string().max(100).optional(),
  achievements: z.array(z.unknown()).default([]),
  earnedDoneTags: z.array(z.string()).default([]),
  engagement: MemberEngagementDtoSchema.optional(),
  notes: z.string().optional(),
} satisfies z.ZodRawShape;

const updateMemberShape = {
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
  scholarship: z.boolean().optional(),
  joinMonth: z.string().min(1).max(20).optional(),
  program: z.string().max(255).optional(),
  mentorshipDuration: z.coerce.number().int().min(0).optional(),
  nTagStatus: z.string().max(100).optional(),
  platform: z.string().max(100).optional(),
  regInUS: z.boolean().optional(),
  lifecycleStage: MemberLifecycleStageEnum.optional(),
  company: z.string().max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  industry: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  address: MemberAddressDtoSchema.optional(),
  socialProfile: SocialProfileDtoSchema.optional(),
  birthDate: z.string().max(50).optional(),
  gender: z.string().max(50).optional(),
  linkedinUrl: z.string().max(500).optional(),
  serviceLevel: z.string().max(100).optional(),
  achievements: z.array(z.unknown()).optional(),
  earnedDoneTags: z.array(z.string()).optional(),
  engagement: MemberEngagementDtoSchema.optional(),
  notes: z.string().optional(),
} satisfies z.ZodRawShape;

export const CreateMemberDtoSchema = z.object(createMemberShape);
export type CreateMemberDto = z.infer<typeof CreateMemberDtoSchema>;

export const UpdateMemberDtoSchema = z.object(updateMemberShape);
export type UpdateMemberDto = z.infer<typeof UpdateMemberDtoSchema>;

export const MemberResponseDtoSchema = z.object({
  ...createMemberShape,
  id: z.string().min(1).max(100),
});
export type MemberResponseDto = z.infer<typeof MemberResponseDtoSchema>;

export const MemberQueryDtoSchema = z.object({
  search: z.string().optional(),
  lifecycleStage: MemberLifecycleStageEnum.optional(),
  platform: z.string().optional(),
  tag: z.string().optional(),
  sortBy: z.enum(['joinMonth', 'name', 'createdAt']).default('joinMonth'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type MemberQueryDto = z.infer<typeof MemberQueryDtoSchema>;
