import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  normalizeSupabaseJwtKey,
  normalizeSupabaseUrl,
} from '../../common/supabase-service-env';
import {
  VOUCHER_BROADCAST_CHANNEL,
  VOUCHER_BROADCAST_EVENT,
} from './voucher-realtime.constants';

@Injectable()
export class VoucherBroadcastService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoucherBroadcastService.name);
  private client: SupabaseClient | null = null;
  private hubChannel: RealtimeChannel | null = null;
  private hubReady = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxReconnectDelayMs = 30_000;
  private lastSkipLogAt = 0;

  async onModuleInit(): Promise<void> {
    const disabled =
      process.env.DISABLE_VOUCHER_BROADCAST === '1' ||
      process.env.DISABLE_VOUCHER_BROADCAST === 'true';
    if (disabled) {
      this.logger.log('Voucher broadcast skipped (DISABLE_VOUCHER_BROADCAST).');
      return;
    }

    const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
    const key = normalizeSupabaseJwtKey(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    );
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — voucher realtime disabled.',
      );
      return;
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => key,
      realtime: { timeout: 30_000 },
    });

    this.trySubscribeHub();
  }

  private trySubscribeHub(): void {
    if (!this.client) return;

    if (this.hubChannel) {
      void this.client.removeChannel(this.hubChannel);
      this.hubChannel = null;
    }
    this.hubReady = false;

    this.hubChannel = this.client.channel(VOUCHER_BROADCAST_CHANNEL, {
      config: { broadcast: { ack: false } },
    });

    this.hubChannel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.hubReady = true;
        this.reconnectAttempts = 0;
        this.logger.log(
          `Realtime Broadcast hub subscribed: ${VOUCHER_BROADCAST_CHANNEL}`,
        );
        return;
      }

      this.hubReady = false;

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.logger.warn(
          `Voucher Realtime hub: ${status}${err ? ` ${String(err)}` : ''}`,
        );
        this.reconnectAttempts += 1;
        const delayMs = Math.min(
          2_000 * this.reconnectAttempts,
          this.maxReconnectDelayMs,
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
    if (this.client && this.hubChannel) {
      try {
        await this.client.removeChannel(this.hubChannel);
      } catch (error) {
        this.logger.warn(
          `Failed to remove voucher hub channel cleanly: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.hubChannel = null;
    this.client = null;
    this.hubReady = false;
  }

  async notifyVoucherUpdated(payload: {
    voucherCode: string;
    usageCount: number;
    budgetBurned: number;
  }): Promise<void> {
    if (!this.hubChannel || !this.client) return;

    if (!this.hubReady) {
      const now = Date.now();
      if (now - this.lastSkipLogAt > 60_000) {
        this.lastSkipLogAt = now;
        this.logger.debug('Skipping voucher broadcast — hub not SUBSCRIBED yet');
      }
      return;
    }

    const res = await this.hubChannel.send({
      type: 'broadcast',
      event: VOUCHER_BROADCAST_EVENT,
      payload: {
        voucherCode: payload.voucherCode,
        usageCount: payload.usageCount,
        budgetBurned: payload.budgetBurned,
        at: new Date().toISOString(),
      },
    });

    if (res !== 'ok') {
      this.logger.warn(`Voucher broadcast send failed: ${res}`);
    }
  }
}
