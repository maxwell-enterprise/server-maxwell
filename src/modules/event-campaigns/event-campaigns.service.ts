import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEventCampaignDtoSchema } from './dto/event-campaign.dto';

export type EventCampaignAssignmentStatus =
  | 'PENDING_LOGIN'
  | 'ACTIVE'
  | 'DISMISSED'
  | 'CONVERTED'
  | 'SKIPPED_HAS_TICKET';

type CampaignRow = {
  internalId: string;
  publicId: string;
  name: string;
  formId: string;
  formTitle: string;
  targetProductId: string;
  linkedDiscountCode: string | null;
  mustBeAccepted: boolean;
  createdBy: string | null;
  createdAt: string;
};

type AssignmentRow = {
  id: string;
  campaignId: string;
  recipientEmail: string;
  recipientName: string | null;
  userId: string | null;
  status: EventCampaignAssignmentStatus;
  dismissedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

@Injectable()
export class EventCampaignsService {
  private readonly logger = new Logger(EventCampaignsService.name);

  constructor(
    private readonly db: DbService,
    private readonly prisma: PrismaService,
  ) {}

  async listCampaigns(): Promise<unknown[]> {
    const res = await this.db.query<CampaignRow>(
      `
      select
        coalesce(nullif(trim(ec.public_id), ''), ec.id::text) as "publicId",
        ec.id::text as "internalId",
        ec.name,
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as "formId",
        ec.form_title as "formTitle",
        ec.target_product_id as "targetProductId",
        ec.linked_discount_code as "linkedDiscountCode",
        ec.must_be_accepted as "mustBeAccepted",
        ec.created_by as "createdBy",
        ec.created_at as "createdAt"
      from event_campaigns ec
      join forms f on f.id = ec.form_id
      order by ec.created_at desc
      `,
    );

    const campaigns = await Promise.all(
      res.rows.map(async (row) => {
        const stats = await this.assignmentStats(row.internalId);
        return {
          id: row.publicId,
          name: row.name,
          formId: row.formId,
          formTitle: row.formTitle,
          targetProductId: row.targetProductId,
          linkedDiscountCode: row.linkedDiscountCode ?? undefined,
          mustBeAccepted: row.mustBeAccepted,
          createdBy: row.createdBy ?? undefined,
          createdAt: toIso(row.createdAt),
          stats,
        };
      }),
    );
    return campaigns;
  }

  async listFormRespondents(formIdentifier: string): Promise<unknown[]> {
    const form = await this.findFormInternalId(formIdentifier);
    const res = await this.db.query<{
      userName: string | null;
      userEmail: string;
      userId: string | null;
      submittedAt: string;
    }>(
      `
      select distinct on (lower(trim(r.user_email)))
        r.user_name as "userName",
        trim(r.user_email) as "userEmail",
        r.user_id as "userId",
        r.submitted_at as "submittedAt"
      from form_responses r
      where r.form_id = $1::uuid
        and trim(coalesce(r.user_email, '')) <> ''
      order by lower(trim(r.user_email)), r.submitted_at desc
      `,
      [form.internalId],
    );

    return res.rows.map((row) => ({
      name: row.userName?.trim() || row.userEmail.split('@')[0] || 'Respondent',
      email: row.userEmail,
      userId: row.userId?.trim() || undefined,
      submittedAt: toIso(row.submittedAt),
    }));
  }

  async sendCampaign(
    actorUserId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = SendEventCampaignDtoSchema.parse(body ?? {});
    const form = await this.findFormInternalId(dto.formId);
    const emails = [
      ...new Set(dto.recipientEmails.map((e) => normalizeEmail(e))),
    ];

    const publicId = `EVC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const campaignInsert = await this.db.query<{ id: string }>(
      `
      insert into event_campaigns (
        public_id,
        name,
        form_id,
        form_title,
        target_product_id,
        linked_discount_code,
        must_be_accepted,
        created_by
      )
      values ($1, $2, $3::uuid, $4, $5, $6, $7, $8)
      returning id::text as id
      `,
      [
        publicId,
        dto.name,
        form.internalId,
        form.title,
        dto.targetProductId,
        dto.linkedDiscountCode?.trim().toUpperCase() || null,
        dto.mustBeAccepted === true,
        actorUserId,
      ],
    );
    const campaignId = campaignInsert.rows[0]?.id;
    if (!campaignId) {
      throw new BadRequestException('Failed to create event campaign');
    }

    const nameByEmail = await this.loadRespondentNames(
      form.internalId,
      emails,
    );

    let sent = 0;
    let skippedHasTicket = 0;
    let pendingLogin = 0;

    for (const email of emails) {
      const user = await this.findUserByEmail(email);
      let status: EventCampaignAssignmentStatus = 'PENDING_LOGIN';
      let userId: string | null = null;

      if (user) {
        userId = user.id;
        const owns = await this.userOwnsProduct(user.id, dto.targetProductId);
        status = owns ? 'SKIPPED_HAS_TICKET' : 'ACTIVE';
        if (owns) skippedHasTicket += 1;
        else sent += 1;
      } else {
        pendingLogin += 1;
      }

      await this.db.query(
        `
        insert into event_campaign_assignments (
          campaign_id,
          recipient_email,
          recipient_name,
          user_id,
          status
        )
        values ($1::uuid, $2, $3, $4, $5)
        on conflict (campaign_id, recipient_email)
        do update set
          recipient_name = excluded.recipient_name,
          user_id = excluded.user_id,
          status = excluded.status,
          updated_at = now()
        `,
        [
          campaignId,
          email,
          nameByEmail.get(email) ?? null,
          userId,
          status,
        ],
      );
    }

    return {
      id: publicId,
      name: dto.name,
      stats: {
        targeted: emails.length,
        active: sent,
        pendingLogin,
        skippedHasTicket,
      },
    };
  }

  async getPendingForUser(
    userId: string,
    userEmail: string | undefined,
  ): Promise<unknown[]> {
    const email = normalizeEmail(userEmail ?? '');
    if (!email) return [];

    await this.syncAssignmentsForEmail(email, userId);

    const res = await this.db.query<
      AssignmentRow & {
        campaignPublicId: string;
        campaignName: string;
        targetProductId: string;
        linkedDiscountCode: string | null;
        mustBeAccepted: boolean;
        formTitle: string;
      }
    >(
      `
      select
        a.id::text as id,
        a.campaign_id::text as "campaignId",
        a.recipient_email as "recipientEmail",
        a.recipient_name as "recipientName",
        a.user_id as "userId",
        a.status,
        a.dismissed_at as "dismissedAt",
        a.converted_at as "convertedAt",
        a.created_at as "createdAt",
        coalesce(nullif(trim(ec.public_id), ''), ec.id::text) as "campaignPublicId",
        ec.name as "campaignName",
        ec.target_product_id as "targetProductId",
        ec.linked_discount_code as "linkedDiscountCode",
        ec.must_be_accepted as "mustBeAccepted",
        ec.form_title as "formTitle"
      from event_campaign_assignments a
      join event_campaigns ec on ec.id = a.campaign_id
      where lower(trim(a.recipient_email)) = $1
        and a.status = 'ACTIVE'
      order by a.created_at asc
      `,
      [email],
    );

    const out: unknown[] = [];
    for (const row of res.rows) {
      const owns = await this.userOwnsProduct(userId, row.targetProductId);
      if (owns) {
        await this.setAssignmentStatus(row.id, 'CONVERTED');
        continue;
      }
      out.push({
        assignmentId: row.id,
        campaignId: row.campaignPublicId,
        campaignName: row.campaignName,
        formTitle: row.formTitle,
        targetProductId: row.targetProductId,
        linkedDiscountCode: row.linkedDiscountCode ?? undefined,
        mustBeAccepted: row.mustBeAccepted,
        recipientName: row.recipientName ?? undefined,
      });
    }
    return out;
  }

  async dismissAssignment(
    userId: string,
    userEmail: string | undefined,
    assignmentId: string,
  ): Promise<{ ok: boolean }> {
    const email = normalizeEmail(userEmail ?? '');
    const row = await this.findAssignmentForUser(assignmentId, email, userId);
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }
    if (row.mustBeAccepted) {
      return { ok: true };
    }
    await this.setAssignmentStatus(row.id, 'DISMISSED', {
      dismissedAt: true,
    });
    return { ok: true };
  }

  async markConvertedForPayment(paymentId: string): Promise<void> {
    const paymentRes = await this.db.query<{
      buyerUserId: string | null;
      customerEmail: string;
      itemsSnapshot: Array<{ productId?: string }> | null;
    }>(
      `
      select
        "buyerUserId",
        "customerEmail",
        "itemsSnapshot"
      from payment_transactions
      where id = $1::uuid
      limit 1
      `,
      [paymentId],
    );
    const payment = paymentRes.rows[0];
    if (!payment) return;

    const userId = payment.buyerUserId?.trim() || null;
    const email = normalizeEmail(payment.customerEmail ?? '');
    const productIds = new Set(
      (Array.isArray(payment.itemsSnapshot) ? payment.itemsSnapshot : [])
        .map((item) => String(item?.productId ?? '').trim())
        .filter(Boolean),
    );
    if (productIds.size === 0) return;

    const identityClause = userId
      ? `(a.user_id = $1 or lower(trim(a.recipient_email)) = $2)`
      : `lower(trim(a.recipient_email)) = $1`;
    const params = userId ? [userId, email] : [email];

    const active = await this.db.query<{
      id: string;
      targetProductId: string;
    }>(
      `
      select
        a.id::text as id,
        ec.target_product_id as "targetProductId"
      from event_campaign_assignments a
      join event_campaigns ec on ec.id = a.campaign_id
      where ${identityClause}
        and a.status in ('ACTIVE', 'PENDING_LOGIN', 'DISMISSED')
      `,
      params,
    );

    for (const row of active.rows) {
      if (!productIds.has(row.targetProductId)) continue;
      await this.setAssignmentStatus(row.id, 'CONVERTED', {
        convertedAt: true,
      });
    }
  }

  async getAnalyticsSummary(): Promise<unknown> {
    const res = await this.db.query<{
      totalCampaigns: string;
      totalAssignments: string;
      active: string;
      pendingLogin: string;
      dismissed: string;
      converted: string;
      skipped: string;
    }>(
      `
      select
        (select count(*)::text from event_campaigns) as "totalCampaigns",
        (select count(*)::text from event_campaign_assignments) as "totalAssignments",
        (select count(*)::text from event_campaign_assignments where status = 'ACTIVE') as active,
        (select count(*)::text from event_campaign_assignments where status = 'PENDING_LOGIN') as "pendingLogin",
        (select count(*)::text from event_campaign_assignments where status = 'DISMISSED') as dismissed,
        (select count(*)::text from event_campaign_assignments where status = 'CONVERTED') as converted,
        (select count(*)::text from event_campaign_assignments where status = 'SKIPPED_HAS_TICKET') as skipped
      `,
    );
    const row = res.rows[0];
    return {
      totalCampaigns: Number(row?.totalCampaigns ?? 0),
      totalAssignments: Number(row?.totalAssignments ?? 0),
      active: Number(row?.active ?? 0),
      pendingLogin: Number(row?.pendingLogin ?? 0),
      dismissed: Number(row?.dismissed ?? 0),
      converted: Number(row?.converted ?? 0),
      skippedHasTicket: Number(row?.skipped ?? 0),
    };
  }

  private async assignmentStats(campaignInternalId: string) {
    const res = await this.db.query<{
      status: EventCampaignAssignmentStatus;
      count: string;
    }>(
      `
      select status, count(*)::text as count
      from event_campaign_assignments
      where campaign_id = $1::uuid
      group by status
      `,
      [campaignInternalId],
    );
    const stats: Record<string, number> = {
      targeted: 0,
      active: 0,
      pendingLogin: 0,
      dismissed: 0,
      converted: 0,
      skippedHasTicket: 0,
    };
    for (const row of res.rows) {
      const n = Number(row.count) || 0;
      stats.targeted += n;
      if (row.status === 'ACTIVE') stats.active = n;
      if (row.status === 'PENDING_LOGIN') stats.pendingLogin = n;
      if (row.status === 'DISMISSED') stats.dismissed = n;
      if (row.status === 'CONVERTED') stats.converted = n;
      if (row.status === 'SKIPPED_HAS_TICKET') stats.skippedHasTicket = n;
    }
    return stats;
  }

  private async syncAssignmentsForEmail(
    email: string,
    userId: string,
  ): Promise<void> {
    await this.db.query(
      `
      update event_campaign_assignments
      set
        user_id = $2,
        status = case
          when status = 'PENDING_LOGIN' then 'ACTIVE'
          else status
        end,
        updated_at = now()
      where lower(trim(recipient_email)) = $1
        and status = 'PENDING_LOGIN'
      `,
      [email, userId],
    );

    const pending = await this.db.query<{
      id: string;
      targetProductId: string;
    }>(
      `
      select
        a.id::text as id,
        ec.target_product_id as "targetProductId"
      from event_campaign_assignments a
      join event_campaigns ec on ec.id = a.campaign_id
      where lower(trim(a.recipient_email)) = $1
        and a.status in ('ACTIVE', 'PENDING_LOGIN')
      `,
      [email],
    );

    for (const row of pending.rows) {
      const owns = await this.userOwnsProduct(userId, row.targetProductId);
      if (owns) {
        await this.setAssignmentStatus(row.id, 'SKIPPED_HAS_TICKET');
      }
    }
  }

  private async userOwnsProduct(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const wallet = await this.db.query(
      `
      select 1
      from wallet_items
      where "userId" = $1
        and status in (
          'ACTIVE', 'USED', 'CLAIMED', 'PROCESSING',
          'GIFT_PENDING', 'PENDING_CLAIM'
        )
        and (
          coalesce(meta->>'sourceProductId', '') = $2
          or coalesce(meta->>'productId', '') = $2
        )
      limit 1
      `,
      [userId, productId],
    );
    if (wallet.rows.length > 0) return true;

    const paid = await this.db.query(
      `
      select 1
      from payment_transactions pt
      where pt."buyerUserId" = $1
        and upper(pt.status) = 'PAID'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(pt."itemsSnapshot", '[]'::jsonb)) elem
          where elem->>'productId' = $2
        )
      limit 1
      `,
      [userId, productId],
    );
    return paid.rows.length > 0;
  }

  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string } | null> {
    const normalized = normalizeEmail(email);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    return user?.email ? { id: user.id, email: user.email } : null;
  }

  private async loadRespondentNames(
    formInternalId: string,
    emails: string[],
  ): Promise<Map<string, string>> {
    const res = await this.db.query<{
      userEmail: string;
      userName: string | null;
    }>(
      `
      select distinct on (lower(trim(r.user_email)))
        trim(r.user_email) as "userEmail",
        r.user_name as "userName"
      from form_responses r
      where r.form_id = $1::uuid
        and lower(trim(r.user_email)) = any($2::text[])
      order by lower(trim(r.user_email)), r.submitted_at desc
      `,
      [formInternalId, emails],
    );
    const map = new Map<string, string>();
    for (const row of res.rows) {
      const email = normalizeEmail(row.userEmail);
      const name = row.userName?.trim();
      if (name) map.set(email, name);
    }
    return map;
  }

  private async findFormInternalId(identifier: string): Promise<{
    internalId: string;
    title: string;
  }> {
    const res = await this.db.query<{ internalId: string; title: string }>(
      `
      select f.id::text as "internalId", f.title
      from forms f
      where f.public_id = $1 or f.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException('Form not found');
    }
    return row;
  }

  private async findAssignmentForUser(
    assignmentId: string,
    email: string,
    userId: string,
  ): Promise<{ id: string; mustBeAccepted: boolean } | null> {
    const res = await this.db.query<{
      id: string;
      mustBeAccepted: boolean;
    }>(
      `
      select
        a.id::text as id,
        ec.must_be_accepted as "mustBeAccepted"
      from event_campaign_assignments a
      join event_campaigns ec on ec.id = a.campaign_id
      where a.id::text = $1
        and (
          a.user_id = $2
          or lower(trim(a.recipient_email)) = $3
        )
      limit 1
      `,
      [assignmentId, userId, email],
    );
    return res.rows[0] ?? null;
  }

  private async setAssignmentStatus(
    assignmentId: string,
    status: EventCampaignAssignmentStatus,
    opts?: { dismissedAt?: boolean; convertedAt?: boolean },
  ): Promise<void> {
    await this.db.query(
      `
      update event_campaign_assignments
      set
        status = $2,
        dismissed_at = case when $3 then now() else dismissed_at end,
        converted_at = case when $4 then now() else converted_at end,
        updated_at = now()
      where id::text = $1
      `,
      [
        assignmentId,
        status,
        opts?.dismissedAt === true,
        opts?.convertedAt === true,
      ],
    );
  }
}
