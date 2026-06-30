import { z } from 'zod';

function normalizeQueryString(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((part) => String(part ?? '')).join(',');
  }
  return value;
}

export const ExecutiveDashboardQuerySchema = z.object({
  timeRange: z
    .enum(['ALL', 'LAST_30', 'THIS_QUARTER', 'YTD'])
    .default('ALL'),
  program: z.preprocess(
    normalizeQueryString,
    z.string().max(255),
  ).default('ALL'),
  region: z.enum(['ALL', 'DOMESTIC', 'INTL']).default('ALL'),
});

export type ExecutiveDashboardQueryDto = z.infer<
  typeof ExecutiveDashboardQuerySchema
>;
