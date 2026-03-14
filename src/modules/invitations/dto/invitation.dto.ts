import { z } from 'zod';

export const InvitationStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
]);

export const CreateInvitationDtoSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  eventId: z.string().min(1).max(100),
  eventName: z.string().min(1).max(255).optional(),
  tierId: z.string().max(100).optional(),
  tierName: z.string().max(255).optional(),
  memberId: z.string().min(1).max(100),
  memberName: z.string().min(1).max(255).optional(),
  status: InvitationStatusEnum.default('PENDING'),
  validUntil: z.string().datetime(),
  sentAt: z.string().datetime().optional(),
  sentBy: z.string().min(1).max(100),
});
export type CreateInvitationDto = z.infer<typeof CreateInvitationDtoSchema>;

export const CreateInvitationsBatchDtoSchema = z.object({
  invitations: z.array(CreateInvitationDtoSchema).min(1),
});
export type CreateInvitationsBatchDto = z.infer<
  typeof CreateInvitationsBatchDtoSchema
>;

export const AcceptInvitationDtoSchema = z.object({
  userId: z.string().min(1).max(100),
  selectedSubEventIds: z.array(z.string().min(1).max(100)).max(50).optional(),
});
export type AcceptInvitationDto = z.infer<typeof AcceptInvitationDtoSchema>;

export const DeclineInvitationDtoSchema = z.object({
  userId: z.string().min(1).max(100),
});
export type DeclineInvitationDto = z.infer<typeof DeclineInvitationDtoSchema>;

export const UpdateInvitationDtoSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  eventId: z.string().min(1).max(100).optional(),
  eventName: z.string().min(1).max(255).optional(),
  tierId: z.string().max(100).optional(),
  tierName: z.string().max(255).optional(),
  memberId: z.string().min(1).max(100).optional(),
  memberName: z.string().min(1).max(255).optional(),
  status: InvitationStatusEnum.optional(),
  validUntil: z.string().datetime().optional(),
  sentAt: z.string().datetime().optional(),
  sentBy: z.string().min(1).max(100).optional(),
});
export type UpdateInvitationDto = z.infer<typeof UpdateInvitationDtoSchema>;

export const InvitationQueryDtoSchema = z.object({
  memberId: z.string().optional(),
  eventId: z.string().optional(),
  status: InvitationStatusEnum.optional(),
});
export type InvitationQueryDto = z.infer<typeof InvitationQueryDtoSchema>;
