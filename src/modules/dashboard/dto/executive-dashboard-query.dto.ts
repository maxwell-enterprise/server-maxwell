import { z } from 'zod';

export const ExecutiveDashboardQuerySchema = z.object({
  timeRange: z
    .enum(['ALL', 'LAST_30', 'THIS_QUARTER', 'YTD'])
    .default('ALL'),
  program: z.string().max(255).default('ALL'),
  region: z.enum(['ALL', 'DOMESTIC', 'INTL']).default('ALL'),
});

export type ExecutiveDashboardQueryDto = z.infer<
  typeof ExecutiveDashboardQuerySchema
>;
