/**
 * Supabase Realtime Broadcast channel for campaign aggregate metrics.
 *
 * Docs: Broadcast sends low-latency messages over WebSockets without streaming
 * every row change from Postgres — better for fan-out at scale than postgres_changes.
 *
 * Single hub channel: one Nest subscription + all dashboards subscribe with anon key;
 * payload includes `campaignId` so clients merge only relevant rows.
 */
export const CAMPAIGN_METRICS_BROADCAST_CHANNEL = 'campaign_metrics_hub';

/** Client event name (see `.on('broadcast', { event })`). */
export const CAMPAIGN_METRICS_BROADCAST_EVENT = 'metrics_updated';

/**
 * Coalesce rapid clicks per campaign before sending (ms). DB stays exact; UI still feels realtime.
 */
export const CAMPAIGN_METRICS_BROADCAST_COALESCE_MS = 500;
