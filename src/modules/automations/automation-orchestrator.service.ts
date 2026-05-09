import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { CommunicationWhatsappService } from '../communication/communication-whatsapp.service';
import { CommunicationEmailService } from '../communication/communication-email.service';

type TriggerPayload = Record<string, unknown>;

type OpsTemplateItem = {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  scope?: string;
  assignedRole?: string;
  systemTrigger?: string;
};

@Injectable()
export class AutomationOrchestratorService {
  private readonly logger = new Logger(AutomationOrchestratorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly whatsapp: CommunicationWhatsappService,
    private readonly email: CommunicationEmailService,
  ) {}

  async processTrigger(
    triggerIdRaw: string,
    payloadRaw: TriggerPayload,
  ): Promise<void> {
    const triggerId = this.normalize(triggerIdRaw);
    const payload = payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : {};

    await Promise.all([
      this.processWhatsapp(triggerId, payload),
      this.processEmail(triggerId, payload),
      this.processOps(triggerId, payload),
      this.processGamification(triggerId, payload),
      this.logBackgroundCompletion(triggerId, payload),
    ]);
  }

  private normalize(v: unknown): string {
    return String(v ?? '').trim().toUpperCase();
  }

  private pickMemberId(payload: TriggerPayload): string {
    const direct = String(payload.memberId ?? payload.userId ?? '').trim();
    return direct;
  }

  private pickMemberName(payload: TriggerPayload): string {
    return String(
      payload.member_name ?? payload.memberName ?? payload.name ?? 'Member',
    ).trim();
  }

  private pickPhone(payload: TriggerPayload): string {
    return String(payload.phone ?? payload.recipientPhone ?? '').trim();
  }

  private pickEmail(payload: TriggerPayload): string {
    return String(payload.email ?? payload.recipientEmail ?? '').trim();
  }

  private async processWhatsapp(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    const templates = await this.whatsapp.listTemplates();
    const template = templates.find(
      (t) => this.normalize(t.linkedTriggerId) === triggerId,
    );
    if (!template) return;

    const recipientName = this.pickMemberName(payload);
    const recipientPhone = this.pickPhone(payload);
    if (!recipientPhone) return;

    const rawMessage = String(template.message ?? '').trim();
    if (!rawMessage) return;
    const message = rawMessage.replace(
      /\{\{([a-zA-Z0-9_]+)\}\}/g,
      (_all, key: string) => {
        const v = payload[key];
        if (v == null) return '';
        if (typeof v === 'number') return v.toLocaleString('id-ID');
        return String(v);
      },
    );

    const id = `WA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await this.whatsapp.addTask({
      id,
      recipientName,
      recipientPhone,
      category: String(template.category ?? 'GENERAL'),
      message,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      metadata: { triggerId, payload },
    });
  }

  private async processEmail(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    const email = this.pickEmail(payload);
    if (!email) return;
    try {
      await this.email.sendTransactionalByTrigger({
        triggerId,
        variables: {
          ...payload,
          email,
          name: this.pickMemberName(payload),
          member_name: this.pickMemberName(payload),
          phone: this.pickPhone(payload),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Missing template/config should not break orchestration.
      this.logger.debug(`Email trigger skipped ${triggerId}: ${message}`);
    }
  }

  private async processOps(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    await this.instantiateOpsChecklists(triggerId, payload);
    await this.autoCompleteOpsTasks(triggerId, payload);
  }

  private async instantiateOpsChecklists(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    const templates = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      tasks: unknown;
    }>(
      `SELECT id, name, description, tasks
       FROM ops_templates`,
    );

    const memberId = this.pickMemberId(payload);
    const memberName = this.pickMemberName(payload);
    const transactionId = String(payload.transactionId ?? payload.txId ?? 'N/A');
    const productName = String(
      payload.product_name ?? payload.productName ?? payload.itemName ?? 'Workflow',
    ).trim();
    const triggerProductId = String(payload.productId ?? payload.itemId ?? '').trim();

    for (const tpl of templates.rows) {
      const conf =
        tpl.tasks && typeof tpl.tasks === 'object' && !Array.isArray(tpl.tasks)
          ? (tpl.tasks as Record<string, unknown>)
          : {};
      const isActive = conf.isActive !== false;
      if (!isActive) continue;
      const triggerType = this.normalize(conf.triggerType);

      let matches = false;
      if (triggerType === 'SYSTEM_EVENT') {
        matches = this.normalize(conf.triggerEventId) === triggerId;
      } else if (triggerType === 'PRODUCT_PURCHASE') {
        matches = triggerId === 'PAYMENT_SUCCESS';
        if (matches) {
          const requiredProduct = String(conf.triggerProductId ?? 'ALL').trim();
          if (
            requiredProduct &&
            requiredProduct !== 'ALL' &&
            triggerProductId &&
            requiredProduct !== triggerProductId
          ) {
            matches = false;
          }
        }
      }
      if (!matches) continue;

      const items = Array.isArray(conf.items) ? (conf.items as OpsTemplateItem[]) : [];
      const checklistFeId = `CHK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const now = new Date().toISOString();
      const tasks = items.map((item, idx) => ({
        id: `TSK-${checklistFeId}-${idx}`,
        templateItemId: String(item.id ?? `item-${idx}`),
        title: String(item.title ?? `Task ${idx + 1}`),
        description: String(item.description ?? ''),
        type: String(item.type ?? 'MANUAL'),
        scope: String(item.scope ?? 'USER_LEVEL'),
        status: 'PENDING',
        assignedRole: String(item.assignedRole ?? 'Operations'),
        systemTrigger:
          item.systemTrigger != null ? this.normalize(item.systemTrigger) : undefined,
        initiatedAt: now,
        logs: [],
      }));

      const tasksPayload = {
        feId: checklistFeId,
        templateId: String(conf.feId ?? tpl.id),
        transactionId,
        memberId,
        memberName,
        productName: productName || tpl.name,
        status: 'ACTIVE',
        progress: 0,
        createdAt: now,
        updatedAt: now,
        tasks,
      };

      await this.db.query(
        `INSERT INTO ops_checklists (id, name, description, tasks, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3::jsonb, now())`,
        [memberName || 'Checklist', productName || tpl.name, JSON.stringify(tasksPayload)],
      );
    }
  }

  private async autoCompleteOpsTasks(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    const memberId = this.pickMemberId(payload);
    const rows = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      createdAt: Date;
      tasks: unknown;
    }>(
      `SELECT id, name, description, "createdAt", tasks
       FROM ops_checklists`,
    );

    for (const row of rows.rows) {
      const body =
        row.tasks && typeof row.tasks === 'object' && !Array.isArray(row.tasks)
          ? (row.tasks as Record<string, unknown>)
          : {};
      const taskList = Array.isArray(body.tasks)
        ? (body.tasks as Array<Record<string, unknown>>)
        : [];
      const ownerId = String(body.memberId ?? '').trim();
      if (memberId && ownerId && ownerId !== memberId) continue;

      let changed = false;
      const now = new Date().toISOString();
      const nextTasks = taskList.map((task) => {
        const status = this.normalize(task.status);
        const type = this.normalize(task.type);
        const waitingTrigger = this.normalize(task.systemTrigger);
        if (
          status === 'PENDING' &&
          type === 'AUTOMATED' &&
          waitingTrigger === triggerId
        ) {
          changed = true;
          const logs = Array.isArray(task.logs) ? [...task.logs] : [];
          logs.push({
            timestamp: now,
            actor: 'SYSTEM',
            action: 'SYSTEM_EVENT',
            note: `Auto-completed by system event: ${triggerId}`,
          });
          return {
            ...task,
            status: 'COMPLETED',
            completedAt: now,
            completedBy: 'SYSTEM',
            logs,
          };
        }
        return task;
      });
      if (!changed) continue;

      const total = nextTasks.length;
      const completed = nextTasks.filter(
        (task) => this.normalize(task.status) === 'COMPLETED',
      ).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const nextPayload = {
        ...body,
        tasks: nextTasks,
        progress,
        status: progress === 100 ? 'COMPLETED' : 'ACTIVE',
        updatedAt: now,
      };
      await this.db.query(
        `UPDATE ops_checklists
         SET tasks = $2::jsonb
         WHERE id = $1::uuid`,
        [row.id, JSON.stringify(nextPayload)],
      );
    }
  }

  private async processGamification(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    const memberId = this.pickMemberId(payload);
    if (!memberId) return;
    const triggerKeys = [triggerId];
    if (triggerId === 'PAYMENT_SUCCESS') {
      triggerKeys.push('PURCHASE_COMPLETE');
    }

    const rules = await this.db.query<{
      triggerType: string;
      points: number;
      isActive: boolean;
    }>(
      `SELECT "triggerType", points, "isActive"
       FROM gamification_rules
       WHERE "triggerType" = ANY($1::text[])`,
      [triggerKeys],
    );

    const badges = await this.db.query<{
      id: string;
      name: string;
      autoTrigger: string | null;
      pointBonus: number;
    }>(
      `SELECT id, name, "autoTrigger", "pointBonus"
       FROM gamification_badges
       WHERE "autoTrigger" = ANY($1::text[])`,
      [triggerKeys],
    );

    const pointFromRules = rules.rows
      .filter((row) => row.isActive !== false)
      .reduce((sum, row) => sum + Number(row.points ?? 0), 0);
    const pointFromBadges = badges.rows.reduce(
      (sum, row) => sum + Number(row.pointBonus ?? 0),
      0,
    );
    const totalAward = pointFromRules + pointFromBadges;

    const current = await this.db.query<{
      userId: string;
      userName: string;
      avatarUrl: string | null;
      totalPoints: number;
      currentLevel: string;
      badges: string[] | null;
      rank: number | null;
      streakCount: number;
    }>(
      `SELECT "userId", "userName", "avatarUrl", "totalPoints", "currentLevel", badges, rank, "streakCount"
       FROM gamification_profiles
       WHERE "userId" = $1
       LIMIT 1`,
      [memberId],
    );

    const existing = current.rows[0];
    const existingBadges = Array.isArray(existing?.badges) ? existing.badges : [];
    const nextBadges = [...existingBadges];
    for (const badge of badges.rows) {
      if (!nextBadges.includes(badge.id)) nextBadges.push(badge.id);
    }
    const nextTotal = Number(existing?.totalPoints ?? 0) + totalAward;
    const nextLevel =
      nextTotal > 3000
        ? 'Platinum'
        : nextTotal > 1500
          ? 'Gold'
          : nextTotal > 500
            ? 'Silver'
            : 'Bronze';

    await this.db.query(
      `INSERT INTO gamification_profiles ("userId", "userName", "avatarUrl", "totalPoints", "currentLevel", badges, rank, "streakCount")
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8)
       ON CONFLICT ("userId") DO UPDATE SET
         "userName" = EXCLUDED."userName",
         "avatarUrl" = EXCLUDED."avatarUrl",
         "totalPoints" = EXCLUDED."totalPoints",
         "currentLevel" = EXCLUDED."currentLevel",
         badges = EXCLUDED.badges,
         rank = EXCLUDED.rank,
         "streakCount" = EXCLUDED."streakCount"`,
      [
        memberId,
        existing?.userName ?? this.pickMemberName(payload) ?? 'Member',
        existing?.avatarUrl ?? null,
        nextTotal,
        nextLevel,
        nextBadges,
        existing?.rank ?? 0,
        existing?.streakCount ?? 0,
      ],
    );
  }

  private async logBackgroundCompletion(
    triggerId: string,
    payload: TriggerPayload,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO system_background_jobs (id, type, payload, status, timestamp)
       VALUES ($1, $2, $3::jsonb, $4, now())`,
      [
        `JOB-AUTO-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        'AUTOMATION_ORCHESTRATION',
        JSON.stringify({
          triggerId,
          memberId: this.pickMemberId(payload) || null,
        }),
        'COMPLETED',
      ],
    );
  }
}

