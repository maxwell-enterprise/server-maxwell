export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export class EventInvitation {
  id: string;
  eventId: string;
  eventName: string;
  tierId?: string;
  tierName?: string;
  memberId: string;
  memberName: string;
  status: InvitationStatus;
  validUntil: string;
  sentAt: string;
  sentBy: string;
}
