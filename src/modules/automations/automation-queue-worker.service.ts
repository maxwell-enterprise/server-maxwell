import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DatabaseService } from '../../common/database/database.service';
import { CommunicationEmailService } from '../communication/communication-email.service';

type QueueRow = {
  id: string;
  triggerType: string;
  contextData: Record<string, unknown>;
  description: string;
};

/**
 * Postgres-backed automation execution (no Redis).
 * Claims one `automation_queue` row per tick with SKIP LOCKED; runs server-side handlers
 * (e.g. transactional email). Complements the FE piggyback worker when API mode is on.
 *
 * Disable: `DISABLE_AUTOMATION_QUEUE_WORKER=true`
 *
 * Tick interval is fixed at 10s here (no extra infra). Tune later via `ScheduleModule` +
 * `SchedulerRegistry` if you need env-driven cadence.
 */
@Injectable()
export class AutomationQueueWorkerService {
  private readonly logger = new Logger(AutomationQueueWorkerService.name);
  private tickInFlight = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly email: CommunicationEmailService,
  ) {}

  private workerDisabled(): boolean {
    const v = String(
      process.env.DISABLE_AUTOMATION_QUEUE_WORKER ?? '',
    ).trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  @Interval(10_000)
  async onIntervalTick(): Promise<void> {
    if (this.workerDisabled()) {
      return;
    }
    await this.runOneTick();
  }

  /** Exposed for tests / manual trigger without waiting for the interval. */
  async runOneTick(): Promise<void> {
    if (this.workerDisabled() || this.tickInFlight) {
      return;
    }
    this.tickInFlight = true;
    try {
      const burstRaw = Number(process.env.AUTOMATION_QUEUE_BURST_PER_TICK ?? 8);
      const maxBurst = Math.min(
        12,
        Math.max(1, Number.isFinite(burstRaw) ? Math.floor(burstRaw) : 8),
      );
      for (let i = 0; i < maxBurst; i++) {
        const row = await this.claimNextPendingJob();
        if (!row) {
          break;
        }
        try {
          await this.executeJob(row);
          await this.finishJob(row.id, 'COMPLETED', null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Automation job ${row.id} (${row.triggerType}) failed: ${msg}`,
          );
          await this.finishJob(row.id, 'FAILED', msg);
        }
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async claimNextPendingJob(): Promise<QueueRow | null> {
    return this.db.withTransaction(async (client) => {
      const res = await client.query<{
        id: string;
        triggerType: string;
        contextData: unknown;
        description: string;
      }>(
        `
        WITH picked AS (
          SELECT id
          FROM automation_queue
          WHERE status = 'PENDING'
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE automation_queue q
        SET status = 'PROCESSING'
        FROM picked
        WHERE q.id = picked.id
        RETURNING q.id, q."triggerType" AS "triggerType", q."contextData" AS "contextData", q.description
        `,
      );
      const r = res.rows[0];
      if (!r) {
        return null;
      }
      const ctx =
        r.contextData &&
        typeof r.contextData === 'object' &&
        !Array.isArray(r.contextData)
          ? (r.contextData as Record<string, unknown>)
          : {};
      return {
        id: r.id,
        triggerType: String(r.triggerType ?? ''),
        contextData: ctx,
        description: String(r.description ?? ''),
      };
    });
  }

  private async executeJob(row: QueueRow): Promise<void> {
    const t = row.triggerType.trim().toUpperCase();

    if (t === 'EMAIL') {
      const triggerId = String(
        row.contextData.emailTriggerId ??
          row.contextData.emailTrigger ??
          '',
      ).trim();
      if (!triggerId) {
        throw new Error('EMAIL job missing contextData.emailTriggerId');
      }
      await this.email.sendTransactionalByTrigger({
        triggerId,
        variables: {
          memberId: row.contextData.memberId,
          member_name: row.contextData.member_name,
          name: row.contextData.name,
          email: row.contextData.email,
          phone: row.contextData.phone,
          join_date: row.contextData.join_date,
        },
      });
      return;
    }

    throw new Error(
      `No server handler for automation_queue.triggerType="${row.triggerType}". ` +
        `Either extend AutomationQueueWorkerService or process via client worker / manual ops.`,
    );
  }

  private async finishJob(
    id: string,
    status: 'COMPLETED' | 'FAILED',
    errorLog: string | null,
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE automation_queue
      SET status = $2,
          "processedAt" = now(),
          "errorLog" = $3
      WHERE id = $1
      `,
      [id, status, errorLog],
    );
  }
}
