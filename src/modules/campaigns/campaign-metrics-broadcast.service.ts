import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  normalizeSupabaseJwtKey,
  normalizeSupabaseUrl,
} from '../../common/supabase-service-env';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  CAMPAIGN_METRICS_BROADCAST_CHANNEL,
  CAMPAIGN_METRICS_BROADCAST_COALESCE_MS,
  CAMPAIGN_METRICS_BROADCAST_EVENT,
} from './campaign-metrics.constants';

export interface CampaignMetricsPayload {
  campaignId: string;
  sourceCode: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

type CoalesceEntry = {
  snapshot: CampaignMetricsPayload;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Pushes live metric updates to dashboards via **Supabase Realtime Broadcast**
 * (service role on the server only — never expose the key to the browser).
 *
 * Why Broadcast vs postgres_changes:
 * - Broadcast is meant for low-latency fan-out; postgres_changes replays WAL row events
 *   and scales poorly when many clients subscribe to hot tables.
 * - We still keep Postgres (`campaigns`) as source of truth; this only notifies UIs.
 *
 * Coalescing: high click volume is absorbed in DB (append events + atomic counters);
 * websocket messages are debounced per campaign so we do not emit one message per click.
 *
 * @see https://supabase.com/docs/guides/realtime/broadcast
 */
@Injectable()
export class CampaignMetricsBroadcastService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CampaignMetricsBroadcastService.name);
  private client: SupabaseClient | null = null;
  private hubChannel: RealtimeChannel | null = null;
  private hubReady = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxReconnectDelayMs = 30_000;
  private lastSkipBroadcastLogAt = 0;
  private readonly coalesce = new Map<string, CoalesceEntry>();

  async onModuleInit(): Promise<void> {
    const disabled =
      process.env.DISABLE_CAMPAIGN_METRICS_BROADCAST === '1' ||
      process.env.DISABLE_CAMPAIGN_METRICS_BROADCAST === 'true';
    if (disabled) {
      this.logger.log(
        'Campaign metrics broadcast skipped (DISABLE_CAMPAIGN_METRICS_BROADCAST).',
      );
      return;
    }

    const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
    const key = normalizeSupabaseJwtKey(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    );
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — campaign metrics broadcast disabled.',
      );
      return;
    }

    if (key.length < 40) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY looks too short — paste the full Secret key from Supabase (Reveal). Truncated keys often cause Realtime TIMED_OUT.',
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => key,
      realtime: {
        // Default Realtime push timeout is 10s; slow networks / cold start can hit TIMED_OUT.
        timeout: 30_000,
      },
    });

    this.trySubscribeHub();
  }

  /**
   * Subscribe to the broadcast hub; on TIMED_OUT / CHANNEL_ERROR retry with backoff
   * (local VPN, cold Realtime, or transient network).
   */
  private trySubscribeHub(): void {
    if (!this.client) {
      return;
    }

    if (this.hubChannel) {
      void this.client.removeChannel(this.hubChannel);
      this.hubChannel = null;
    }
    this.hubReady = false;

    this.hubChannel = this.client.channel(CAMPAIGN_METRICS_BROADCAST_CHANNEL, {
      config: { broadcast: { ack: false } },
    });

    this.hubChannel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.hubReady = true;
        this.reconnectAttempts = 0;
        this.logger.log(
          `Realtime Broadcast hub subscribed: ${CAMPAIGN_METRICS_BROADCAST_CHANNEL}`,
        );
        return;
      }

      this.hubReady = false;

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.logger.warn(
          `Realtime hub subscription issue: ${status}${err ? ` ${String(err)}` : ''}`,
        );
        this.reconnectAttempts += 1;
        const delayMs = Math.min(
          2_000 * this.reconnectAttempts,
          this.maxReconnectDelayMs,
        );
        this.logger.log(
          `Retrying Realtime hub in ${delayMs}ms (attempt ${this.reconnectAttempts})`,
        );
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.trySubscribeHub();
        }, delayMs);
      }
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.clearReconnectTimer();
    for (const [, entry] of this.coalesce) {
      clearTimeout(entry.timer);
    }
    this.coalesce.clear();

    if (this.client && this.hubChannel) {
      try {
        await this.client.removeChannel(this.hubChannel);
      } catch (error) {
        this.logger.warn(
          `Failed to remove campaign metrics hub channel cleanly: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.hubChannel = null;
    this.client = null;
    this.hubReady = false;
  }

  /**
   * Schedule a debounced broadcast after click/conversion updates the aggregate row.
   */
  scheduleMetricsBroadcast(payload: CampaignMetricsPayload): void {
    if (!this.client || !this.hubChannel) {
      return;
    }

    const id = payload.campaignId;
    const prev = this.coalesce.get(id);
    if (prev) {
      clearTimeout(prev.timer);
    }

    const snapshot = { ...payload };
    const timer = setTimeout(() => {
      this.coalesce.delete(id);
      void this.sendNow(snapshot);
    }, CAMPAIGN_METRICS_BROADCAST_COALESCE_MS);

    this.coalesce.set(id, { snapshot, timer });
  }

  private async sendNow(payload: CampaignMetricsPayload): Promise<void> {
    if (!this.hubChannel || !this.client) {
      return;
    }

    if (!this.hubReady) {
      const now = Date.now();
      if (now - this.lastSkipBroadcastLogAt > 60_000) {
        this.lastSkipBroadcastLogAt = now;
        this.logger.debug(
          'Skipping broadcast — hub not SUBSCRIBED yet (Realtime connecting or failed; see earlier WARN)',
        );
      }
      return;
    }

    const res = await this.hubChannel.send({
      type: 'broadcast',
      event: CAMPAIGN_METRICS_BROADCAST_EVENT,
      payload: {
        campaignId: payload.campaignId,
        sourceCode: payload.sourceCode,
        clicks: payload.clicks,
        conversions: payload.conversions,
        revenue: payload.revenue,
      },
    });

    if (res !== 'ok') {
      this.logger.warn(`Broadcast send failed: ${res}`);
    }
  }
}
