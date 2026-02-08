/**
 * MAXWELL ERP - User & Auth Zod Schemas
 */

import { z } from 'zod';
import {
  UserRoleEnum,
  MemberLifecycleStageEnum,
  IdentityTypeEnum,
} from './enums.schema';

// =============================================================================
// USER SCHEMA
// =============================================================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  fullName: z.string().min(2).max(255),
  nickname: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.string().max(20).nullable().optional(),
  identityType: IdentityTypeEnum.nullable().optional(),
  identityNumber: z.string().max(100).nullable().optional(),
  role: UserRoleEnum.default('GUEST'),
  lifecycleStage: MemberLifecycleStageEnum.default('GUEST'),
  isActive: z.boolean().default(true),
  isVerified: z.boolean().default(false),
  emailVerifiedAt: z.coerce.date().nullable().optional(),
  phoneVerifiedAt: z.coerce.date().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).default('Indonesia'),
  company: z.string().max(255).nullable().optional(),
  jobTitle: z.string().max(255).nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  totalPoints: z.number().int().default(0),
  currentLevel: z.number().int().default(1),
  referredByUserId: z.string().uuid().nullable().optional(),
  facilitatorId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  lastLoginAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

// Create User Input
export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isVerified: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  totalPoints: true,
  currentLevel: true,
  lastLoginAt: true,
}).extend({
  password: z.string().min(8).max(100),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Update User Input
export const UpdateUserSchema = CreateUserSchema.partial().omit({
  password: true,
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(255),
  phone: z.string().optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// =============================================================================
// SESSION SCHEMA
// =============================================================================

export const UserSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string(),
  deviceInfo: z.record(z.string(), z.unknown()).default({}),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  expiresAt: z.coerce.date(),
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type UserSession = z.infer<typeof UserSessionSchema>;
