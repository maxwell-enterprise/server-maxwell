import { z } from 'zod';

const CartItemDtoSchema = z.object({
  productId: z.string().min(1).max(120),
  variantId: z.string().max(120).optional(),
  quantity: z.coerce.number().int().positive(),
});

export const ActiveCartDtoSchema = z.object({
  sessionId: z.string().min(1).max(255),
  userId: z.string().max(120).optional(),
  userEmail: z.string().email().optional(),
  items: z.array(CartItemDtoSchema),
  lastUpdated: z.string().min(1).max(50),
  totalValue: z.coerce.number().nonnegative(),
  status: z.enum(['ACTIVE', 'ABANDONED', 'CONVERTED']),
});

export type ActiveCartDto = z.infer<typeof ActiveCartDtoSchema>;
