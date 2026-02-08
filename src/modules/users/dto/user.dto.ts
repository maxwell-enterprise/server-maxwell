/**
 * MAXWELL ERP - User DTOs with Zod Validation
 */

import { z } from 'zod';
import {
  UserRoleEnum,
  MemberLifecycleStageEnum,
  IdentityTypeEnum,
} from '../../../schemas/enums.schema';

// =============================================================================
// CREATE USER DTO
// =============================================================================

export const CreateUserDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(255),
  phone: z.string().optional(),
  nickname: z.string().max(100).optional(),
  role: UserRoleEnum.optional().default('MEMBER'),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

// =============================================================================
// UPDATE USER DTO
// =============================================================================

export const UpdateUserDtoSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  nickname: z.string().max(100).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().max(20).optional(),
  identityType: IdentityTypeEnum.optional(),
  identityNumber: z.string().max(100).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  company: z.string().max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  linkedinUrl: z.string().url().optional(),
  industry: z.string().max(100).optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;

// =============================================================================
// UPDATE USER ROLE DTO (Admin only)
// =============================================================================

export const UpdateUserRoleDtoSchema = z.object({
  role: UserRoleEnum,
  lifecycleStage: MemberLifecycleStageEnum.optional(),
});

export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleDtoSchema>;

// =============================================================================
// USER RESPONSE DTO
// =============================================================================

export const UserResponseDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().nullable(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: UserRoleEnum,
  lifecycleStage: MemberLifecycleStageEnum,
  isActive: z.boolean(),
  isVerified: z.boolean(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  totalPoints: z.number(),
  currentLevel: z.number(),
  createdAt: z.coerce.date(),
});

export type UserResponseDto = z.infer<typeof UserResponseDtoSchema>;

// =============================================================================
// USER QUERY DTO
// =============================================================================

export const UserQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: UserRoleEnum.optional(),
  lifecycleStage: MemberLifecycleStageEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z
    .enum(['createdAt', 'fullName', 'email', 'totalPoints'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type UserQueryDto = z.infer<typeof UserQueryDtoSchema>;
