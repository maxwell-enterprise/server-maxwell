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
  ACCOUNT_DELETION_BROADCAST_CHANNEL,
  ACCOUNT_DELETION_BROADCAST_EVENT,
} from './account-deletion-broadcast.constants';

/**
 * Fan-out account-deletion queue changes over Supabase Realtime **Broadcast** (WebSocket).
 * Server uses service role; browsers subscribe with the anon key on the same channel name.
 *
 * @see https://supabase.com/docs/guides/realtime/broadcast
 */
@Injectable()
export class AccountDeletionBroadcastService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccountDeletionBroadcastService.name);
  private client: SupabaseClient | null = null;
  private hubChannel: RealtimeChannel | null = null;
  private hubReady = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxReconnectDelayMs = 30_000;
  private lastSkipLogAt = 0;

  async onModuleInit(): Promise<void> {
    const disabled =
      process.env.DISABLE_ACCOUNT_DELETION_BROADCAST === '1' ||
      process.env.DISABLE_ACCOUNT_DELETION_BROADCAST === 'true';
    if (disabled) {
      this.logger.log(
        'Account deletion broadcast skipped (DISABLE_ACCOUNT_DELETION_BROADCAST).',
      );
      return;
    }

    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — account deletion realtime disabled.',
      );
      return;
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
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

    this.hubChannel = this.client.channel(ACCOUNT_DELETION_BROADCAST_CHANNEL, {
      config: { broadcast: { ack: false } },
    });

    this.hubChannel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.hubReady = true;
        this.reconnectAttempts = 0;
        this.logger.log(
          `Realtime Broadcast hub subscribed: ${ACCOUNT_DELETION_BROADCAST_CHANNEL}`,
        );
        return;
      }

      this.hubReady = false;

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.logger.warn(
          `Account deletion Realtime hub: ${status}${err ? ` ${String(err)}` : ''}`,
        );
        this.reconnectAttempts += 1;
        const delayMs = Math.min(
          2_000 * this.reconnectAttempts,
          this.maxReconnectDelayMs,
        );
        this.logger.log(
          `Retrying account deletion Realtime hub in ${delayMs}ms (attempt ${this.reconnectAttempts})`,
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
          `Failed to remove account deletion hub channel cleanly: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.hubChannel = null;
    this.client = null;
    this.hubReady = false;
  }

  /** Notify all subscribers to refetch the pending queue / deletion status. */
  async notifyQueueChanged(): Promise<void> {
    if (!this.hubChannel || !this.client) return;

    if (!this.hubReady) {
      const now = Date.now();
      if (now - this.lastSkipLogAt > 60_000) {
        this.lastSkipLogAt = now;
        this.logger.debug(
          'Skipping account-deletion broadcast — hub not SUBSCRIBED yet',
        );
      }
      return;
    }

    const res = await this.hubChannel.send({
      type: 'broadcast',
      event: ACCOUNT_DELETION_BROADCAST_EVENT,
      payload: { at: new Date().toISOString() },
    });

    if (res !== 'ok') {
      this.logger.warn(`Account deletion broadcast send failed: ${res}`);
    }
  }
}
