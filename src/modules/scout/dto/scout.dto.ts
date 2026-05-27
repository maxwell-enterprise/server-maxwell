import { z } from 'zod';

const ScoutMessageDtoSchema = z.object({
  sender: z.enum(['user', 'ai']),
  text: z.string().min(1).max(4000),
  timestamp: z.coerce.number().int().nonnegative(),
});

export const ScoutChatRequestDtoSchema = z.object({
  sessionId: z.string().min(1).max(100),
  leadName: z.string().min(2).max(255),
  leadEmail: z.string().email(),
  latestUserMessage: z.string().min(1).max(4000),
  messages: z.array(ScoutMessageDtoSchema).max(20),
});

export type ScoutChatRequestDto = z.infer<typeof ScoutChatRequestDtoSchema>;

export const ScoutChatResponseDtoSchema = z.object({
  reply: z.string().min(1),
  status: z.enum(['ACTIVE', 'COMPLETED']),
});

export type ScoutChatResponseDto = z.infer<typeof ScoutChatResponseDtoSchema>;
