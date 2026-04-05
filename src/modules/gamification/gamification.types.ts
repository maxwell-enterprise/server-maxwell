/** Mirrors maxwell-refactor `src/types/gamification.ts` for API responses. */

export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type PointTriggerType =
  | 'EVENT_CHECK_IN'
  | 'EVENT_EARLY_ARRIVAL'
  | 'STREAK_3_EVENTS'
  | 'PURCHASE_COMPLETE'
  | 'REFERRAL_SUCCESS'
  | 'MANUAL_AWARD_ONLY';

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  pointBonus: number;
  autoTrigger?: PointTriggerType;
  triggerThreshold?: number;
}

export interface PointRule {
  id: string;
  triggerType: PointTriggerType;
  points: number;
  description: string;
  isActive: boolean;
}

export interface UserGamificationProfile {
  userId: string;
  userName: string;
  avatarUrl?: string;
  totalPoints: number;
  currentLevel: string;
  badges: string[];
  rank: number;
  streakCount: number;
}
