/**
 * MAXWELL ERP - User Entity
 */

export class User {
  id: string;
  email: string;
  phone?: string | null;
  passwordHash?: string | null;
  fullName: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  identityType?: string | null;
  identityNumber?: string | null;
  role: string;
  lifecycleStage: string;
  isActive: boolean;
  isVerified: boolean;
  emailVerifiedAt?: Date | null;
  phoneVerifiedAt?: Date | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country: string;
  company?: string | null;
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  industry?: string | null;
  totalPoints: number;
  currentLevel: number;
  referredByUserId?: string | null;
  facilitatorId?: string | null;
  metadata: Record<string, unknown>;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
