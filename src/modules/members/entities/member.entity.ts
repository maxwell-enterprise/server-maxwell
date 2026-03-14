import { MemberLifecycleStage } from '../../../schemas/enums.schema';

export interface MemberAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface SocialProfile {
  igVerified: boolean;
  igFollowers: number;
  businessAccounts: string[];
  occupation: string;
  businessType: string;
  communities: string[];
}

export interface MemberEngagement {
  lastActiveDate: string;
  eventsAttendedCount: number;
  contentCompletionRate: number;
  communityReputationScore: number;
  leadScore: number;
}

export class Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  scholarship: boolean;
  joinMonth: string;
  program: string;
  mentorshipDuration: number;
  nTagStatus: string;
  platform: string;
  regInUS: boolean;
  lifecycleStage: MemberLifecycleStage;
  company?: string;
  jobTitle?: string;
  industry?: string;
  tags?: string[];
  address?: MemberAddress;
  socialProfile?: SocialProfile;
  birthDate?: string;
  gender?: string;
  linkedinUrl?: string;
  serviceLevel?: string;
  achievements?: unknown[];
  earnedDoneTags?: string[];
  engagement?: MemberEngagement;
  notes?: string;
}
