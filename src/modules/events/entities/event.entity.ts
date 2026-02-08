/**
 * MAXWELL ERP - Event Entity
 */

export class MasterEvent {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  type: string;
  parentEventId?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  recurringPattern?: string | null;
  recurringEndDate?: Date | null;
  recurringExceptions: Date[];
  locationName?: string | null;
  locationAddress?: string | null;
  locationCity?: string | null;
  locationMapsUrl?: string | null;
  isOnline: boolean;
  onlineMeetingUrl?: string | null;
  totalCapacity?: number | null;
  currentAttendees: number;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  galleryUrls: string[];
  status: string;
  isPublic: boolean;
  isFeatured: boolean;
  registrationStartAt?: Date | null;
  registrationEndAt?: Date | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EventTier {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  currentAttendees: number;
  benefits: string[];
  sortOrder: number;
  createdAt: Date;
}

export class EventGate {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  locationHint?: string | null;
  allowedTierIds: string[];
  isActive: boolean;
  createdAt: Date;
}

export class MasterAccessTag {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  usageType: string;
  category: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
  iconUrl?: string | null;
  colorHex?: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class EventAccessRule {
  id: string;
  eventId: string;
  tagId: string;
  tierId?: string | null;
  usageAmount: number;
  priority: number;
  isActive: boolean;
  createdAt: Date;
}
