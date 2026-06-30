import { z } from 'zod';

export const SendEventCampaignDtoSchema = z.object({
  name: z.string().trim().min(1).max(500),
  formId: z.string().trim().min(1),
  targetProductId: z.string().trim().min(1),
  linkedDiscountCode: z.string().trim().optional(),
  mustBeAccepted: z.boolean().optional().default(false),
  recipientEmails: z.array(z.string().trim().min(3)).min(1),
});

export type SendEventCampaignDto = z.infer<typeof SendEventCampaignDtoSchema>;
