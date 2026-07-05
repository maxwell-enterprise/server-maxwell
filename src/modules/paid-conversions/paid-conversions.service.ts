import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../../common/db.service';

export type PaidConversionRecord = {
  id: string;
  eventType: 'SIGNED_IN' | 'PAID' | 'LEAD' | string;
  paymentTransactionId: string | null;
  orderId: string | null;
  buyerEmail: string;
  buyerName: string | null;
  buyerMemberId: string | null;
  memberPublicId: string | null;
  lifecycleStage: string | null;
  hasPaidEvent: boolean;
  hasSignedInEvent: boolean;
  displayStage: 'LEAD' | 'PAID';
  campaignSourceCode: string | null;
  campaignName: string | null;
  acquisitionType: string;
  picMemberIdSnapshot: string | null;
  picNameSnapshot: string | null;
  picAssignmentIdSnapshot: string | null;
  amount: number;
  totalAmount: number;
  productsSummary: string | null;
  itemsSnapshot: unknown[] | null;
  paidAt: string;
  createdAt: string;
};

type PaymentRow = {
  id: string;
  orderId: string;
  customerEmail: string;
  attributionSource: string | null;
  amount: number;
  totalAmount: number;
  itemsSnapshot: Array<Record<string, unknown>> | null;
  status: string;
  createdAt: string;
};

type ActivePicAssignment = {
  id: string | null;
  picMemberId: string | null;
  picName: string | null;
  resolvedPicName: string | null;
};

/** Join buyer + facilitator from CRM (`members.facilitator_*`, `nTagStatus`). */
const MEMBER_FACILITATOR_JOINS = `
  left join members buyer on (
    (pcr.buyer_member_id is not null and buyer.id = pcr.buyer_member_id)
    or lower(trim(buyer.email)) = lower(trim(pcr.buyer_email))
  )
  left join members facilitator on (
    btrim(coalesce(buyer."nTagStatus", '')) <> ''
    and (
      facilitator.id::text = buyer."nTagStatus"
      or facilitator.public_id = buyer."nTagStatus"
      or facilitator.user_id = buyer."nTagStatus"
    )
  )
`;

const RESOLVED_PIC_NAME_SQL = `
  coalesce(
    nullif(trim(pcr.pic_name_snapshot), ''),
    nullif(trim(buyer.facilitator_name), ''),
    nullif(trim(facilitator.name), '')
  )
`;

const RESOLVED_PIC_MEMBER_ID_SQL = `
  coalesce(
    pcr.pic_member_id_snapshot::text,
    facilitator.id::text
  )
`;

/** Lifecycle rank for merged entity current-state (never use MAX string). */
const PIPELINE_LIFECYCLE_SQL = `('GUEST', 'IDENTIFIED', 'PARTICIPANT')`;

const PAID_LIFECYCLE_SQL = `('MEMBER', 'CERTIFIED', 'FACILITATOR')`;

type StageSegment = 'ALL' | 'LEAD' | 'PAID';

@Injectable()
export class PaidConversionsService {
  private readonly logger = new Logger(PaidConversionsService.name);

  constructor(private readonly db: DbService) {}

  async list(params: {
    search?: string;
    campaignSourceCode?: string;
    campaignOnly?: boolean;
    picMemberId?: string;
    eventType?: string;
    stageSegment?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: PaidConversionRecord[];
    total: number;
    counts: { all: number; lead: number; paid: number };
  }> {
    const stageSegment = this.resolveStageSegment(
      params.stageSegment,
      params.eventType,
    );
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    const filterValues: unknown[] = [];
    let filterIdx = 1;
    const filterConditions: string[] = [];

    if (params.search?.trim()) {
      filterConditions.push(
        `(lower(coalesce(u.buyer_email, '')) like $${filterIdx}
          or lower(coalesce(u.buyer_name, '')) like $${filterIdx}
          or lower(coalesce(u.lifecycle_stage, '')) like $${filterIdx}
          or lower(coalesce(u.first_campaign_code, '')) like $${filterIdx}
          or lower(coalesce(u.first_campaign_name, '')) like $${filterIdx}
          or lower(coalesce(u.products_summary, '')) like $${filterIdx}
          or lower(coalesce(u.pic_name, '')) like $${filterIdx}
          or lower(coalesce(u."orderId", '')) like $${filterIdx})`,
      );
      filterValues.push(`%${params.search.trim().toLowerCase()}%`);
      filterIdx += 1;
    }

    if (params.campaignOnly) {
      filterConditions.push(
        `u.first_campaign_code is not null and btrim(u.first_campaign_code) <> ''`,
      );
    }

    if (params.campaignSourceCode?.trim()) {
      filterConditions.push(
        `lower(u.first_campaign_code) = $${filterIdx}`,
      );
      filterValues.push(params.campaignSourceCode.trim().toLowerCase());
      filterIdx += 1;
    }

    if (params.picMemberId?.trim()) {
      filterConditions.push(`u.pic_member_id = $${filterIdx}`);
      filterValues.push(params.picMemberId.trim());
      filterIdx += 1;
    }

    if (params.startDate?.trim()) {
      filterConditions.push(`u.latest_activity_at >= $${filterIdx}::timestamptz`);
      filterValues.push(params.startDate.trim());
      filterIdx += 1;
    }

    if (params.endDate?.trim()) {
      filterConditions.push(`u.latest_activity_at <= $${filterIdx}::timestamptz`);
      filterValues.push(params.endDate.trim());
      filterIdx += 1;
    }

    const baseFilterWhere = filterConditions.length
      ? `where ${filterConditions.join(' and ')}`
      : '';

    const segmentCondition =
      stageSegment === 'LEAD'
        ? `where u.is_lead`
        : stageSegment === 'PAID'
          ? `where u.is_paid`
          : '';

    const unifiedCte = this.unifiedEntitiesCte();

    const countsRes = await this.db.query<{
      totalAll: string;
      lead: string;
      paid: string;
    }>(
      `
      ${unifiedCte}
      select
        count(*)::text as "totalAll",
        count(*) filter (where u.is_lead)::text as lead,
        count(*) filter (where u.is_paid)::text as paid
      from unified u
      ${baseFilterWhere}
      `,
      filterValues,
    );

    const countRes = await this.db.query<{ total: string }>(
      `
      ${unifiedCte}
      select count(*)::text as total
      from unified u
      ${baseFilterWhere}
      ${segmentCondition ? (baseFilterWhere ? segmentCondition.replace('where', 'and') : segmentCondition) : ''}
      `,
      filterValues,
    );

    const listRes = await this.db.query<Record<string, unknown>>(
      `
      ${unifiedCte}
      select
        u.entity_id as id,
        u.display_stage as "displayStage",
        u.lifecycle_stage as "lifecycleStage",
        u.has_paid_event as "hasPaidEvent",
        u.has_signed_in_event as "hasSignedInEvent",
        u.member_public_id as "memberPublicId",
        u.payment_transaction_id as "paymentTransactionId",
        u."orderId" as "orderId",
        u.buyer_email as "buyerEmail",
        u.buyer_name as "buyerName",
        u.member_uuid::text as "buyerMemberId",
        u.first_campaign_code as "campaignSourceCode",
        u.first_campaign_name as "campaignName",
        u.acquisition_type as "acquisitionType",
        u.pic_member_id as "picMemberIdSnapshot",
        u.pic_name as "picNameSnapshot",
        u.pic_assignment_id as "picAssignmentIdSnapshot",
        u.amount::float8 as amount,
        u."totalAmount"::float8 as "totalAmount",
        u.products_summary as "productsSummary",
        u."itemsSnapshot" as "itemsSnapshot",
        u.latest_activity_at::text as "paidAt",
        u.latest_activity_at::text as "createdAt"
      from unified u
      ${baseFilterWhere}
      ${segmentCondition ? (baseFilterWhere ? segmentCondition.replace('where', 'and') : segmentCondition) : ''}
      order by u.latest_activity_at desc nulls last, u.buyer_name asc nulls last
      limit $${filterIdx} offset $${filterIdx + 1}
      `,
      [...filterValues, limit, offset],
    );

    const countsRow = countsRes.rows[0];
    return {
      items: listRes.rows.map((row) => this.mapUnifiedRow(row)),
      total: Number(countRes.rows[0]?.total ?? 0),
      counts: {
        all: Number(countsRow?.totalAll ?? 0),
        lead: Number(countsRow?.lead ?? 0),
        paid: Number(countsRow?.paid ?? 0),
      },
    };
  }

  private resolveStageSegment(
    stageSegment?: string,
    eventType?: string,
  ): StageSegment {
    const raw = String(stageSegment ?? eventType ?? '')
      .trim()
      .toUpperCase();
    if (raw === 'LEAD' || raw === 'SIGNED_IN') return 'LEAD';
    if (raw === 'PAID') return 'PAID';
    return 'ALL';
  }

  private unifiedEntitiesCte(): string {
    return `
      with pcr_email_agg as (
        select
          lower(trim(pcr.buyer_email)) as email_key,
          bool_or(pcr.event_type = 'PAID') as has_paid_event,
          bool_or(pcr.event_type = 'SIGNED_IN') as has_signed_in_event,
          (
            array_agg(pcr.campaign_source_code order by pcr.paid_at asc)
            filter (where pcr.campaign_source_code is not null and btrim(pcr.campaign_source_code) <> '')
          )[1] as first_campaign_code,
          (
            array_agg(pcr.campaign_name order by pcr.paid_at asc)
            filter (where pcr.campaign_name is not null and btrim(pcr.campaign_name) <> '')
          )[1] as first_campaign_name,
          max(pcr.paid_at) as latest_activity_at,
          min(pcr.paid_at) as first_activity_at
        from paid_conversion_records pcr
        group by lower(trim(pcr.buyer_email))
      ),
      latest_paid as (
        select distinct on (lower(trim(pcr.buyer_email)))
          pcr.id::text as pcr_id,
          lower(trim(pcr.buyer_email)) as email_key,
          pcr.payment_transaction_id::text as payment_transaction_id,
          pcr."orderId" as "orderId",
          pcr.acquisition_type as acquisition_type,
          pcr.pic_assignment_id_snapshot::text as pic_assignment_id,
          pcr.pic_member_id_snapshot,
          pcr.amount::float8 as amount,
          pcr."totalAmount"::float8 as "totalAmount",
          pcr.products_summary as products_summary,
          pcr."itemsSnapshot" as "itemsSnapshot",
          pcr.paid_at as paid_at
        from paid_conversion_records pcr
        where pcr.event_type = 'PAID'
        order by lower(trim(pcr.buyer_email)), pcr.paid_at desc
      ),
      any_pcr as (
        select distinct on (lower(trim(pcr.buyer_email)))
          lower(trim(pcr.buyer_email)) as email_key,
          pcr.buyer_name as buyer_name
        from paid_conversion_records pcr
        order by lower(trim(pcr.buyer_email)), pcr.paid_at desc
      ),
      entity_keys as (
        select lower(trim(m.email)) as email_key
        from members m
        where upper(coalesce(m."lifecycleStage", 'GUEST')) in ${PIPELINE_LIFECYCLE_SQL}
        union
        select p.email_key from pcr_email_agg p
      ),
      unified as (
        select
          coalesce(m.id::text, 'email:' || ek.email_key) as entity_id,
          m.id as member_uuid,
          coalesce(nullif(trim(m.public_id), ''), m.id::text) as member_public_id,
          ek.email_key,
          coalesce(nullif(trim(m.email), ''), ek.email_key) as buyer_email,
          coalesce(nullif(trim(m.name), ''), nullif(trim(ap.buyer_name), '')) as buyer_name,
          upper(coalesce(m."lifecycleStage", case when coalesce(p.has_paid_event, false) then 'MEMBER' else 'IDENTIFIED' end)) as lifecycle_stage,
          coalesce(p.has_paid_event, false) as has_paid_event,
          coalesce(p.has_signed_in_event, false) as has_signed_in_event,
          p.first_campaign_code,
          p.first_campaign_name,
          lp.payment_transaction_id,
          lp."orderId",
          coalesce(
            lp.acquisition_type,
            case
              when p.first_campaign_code is not null and btrim(p.first_campaign_code) <> ''
              then 'CAMPAIGN'
              else 'DIRECT'
            end
          ) as acquisition_type,
          lp.pic_assignment_id,
          coalesce(lp.amount, 0) as amount,
          coalesce(lp."totalAmount", 0) as "totalAmount",
          lp.products_summary,
          lp."itemsSnapshot",
          coalesce(
            nullif(trim(m.facilitator_name), ''),
            nullif(trim(facilitator.name), '')
          ) as pic_name,
          coalesce(
            facilitator.id::text,
            lp.pic_member_id_snapshot::text
          ) as pic_member_id,
          coalesce(p.latest_activity_at, m."createdAt", lp.paid_at) as latest_activity_at,
          case
            when coalesce(p.has_paid_event, false)
              or upper(coalesce(m."lifecycleStage", 'GUEST')) in ${PAID_LIFECYCLE_SQL}
            then 'PAID'
            else 'LEAD'
          end as display_stage,
          upper(coalesce(m."lifecycleStage", 'GUEST')) in ${PIPELINE_LIFECYCLE_SQL}
            and not coalesce(p.has_paid_event, false)
            and upper(coalesce(m."lifecycleStage", 'GUEST')) not in ${PAID_LIFECYCLE_SQL} as is_lead,
          coalesce(p.has_paid_event, false)
            or upper(coalesce(m."lifecycleStage", 'GUEST')) in ${PAID_LIFECYCLE_SQL} as is_paid
        from entity_keys ek
        left join members m on lower(trim(m.email)) = ek.email_key
        left join pcr_email_agg p on p.email_key = ek.email_key
        left join latest_paid lp on lp.email_key = ek.email_key
        left join any_pcr ap on ap.email_key = ek.email_key
        left join members facilitator on (
          m.id is not null
          and btrim(coalesce(m."nTagStatus", '')) <> ''
          and (
            facilitator.id::text = m."nTagStatus"
            or facilitator.public_id = m."nTagStatus"
            or facilitator.user_id = m."nTagStatus"
          )
        )
      )
    `;
  }

  private mapUnifiedRow(row: Record<string, unknown>): PaidConversionRecord {
    const displayStage = String(row.displayStage ?? 'LEAD') as 'LEAD' | 'PAID';
    return {
      id: String(row.id ?? ''),
      eventType: displayStage,
      displayStage,
      lifecycleStage: (row.lifecycleStage as string | null) ?? null,
      hasPaidEvent: Boolean(row.hasPaidEvent),
      hasSignedInEvent: Boolean(row.hasSignedInEvent),
      memberPublicId: (row.memberPublicId as string | null) ?? null,
      paymentTransactionId: (row.paymentTransactionId as string | null) ?? null,
      orderId: (row.orderId as string | null) ?? null,
      buyerEmail: String(row.buyerEmail ?? ''),
      buyerName: (row.buyerName as string | null) ?? null,
      buyerMemberId: (row.buyerMemberId as string | null) ?? null,
      campaignSourceCode: (row.campaignSourceCode as string | null) ?? null,
      campaignName: (row.campaignName as string | null) ?? null,
      acquisitionType: String(row.acquisitionType ?? 'DIRECT'),
      picMemberIdSnapshot: (row.picMemberIdSnapshot as string | null) ?? null,
      picNameSnapshot: (row.picNameSnapshot as string | null) ?? null,
      picAssignmentIdSnapshot:
        (row.picAssignmentIdSnapshot as string | null) ?? null,
      amount: Number(row.amount) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      productsSummary: (row.productsSummary as string | null) ?? null,
      itemsSnapshot: (row.itemsSnapshot as unknown[] | null) ?? null,
      paidAt: String(row.paidAt ?? ''),
      createdAt: String(row.createdAt ?? ''),
    };
  }

  /**
   * Idempotent: one row per PAID payment. Resolves campaign + active PIC at payment time.
   */
  async recordForPayment(paymentId: string): Promise<PaidConversionRecord | null> {
    const paymentRes = await this.db.query<PaymentRow>(
      `
      select
        id::text as id,
        "orderId" as "orderId",
        "customerEmail" as "customerEmail",
        "attributionSource" as "attributionSource",
        amount::float8 as amount,
        "totalAmount"::float8 as "totalAmount",
        "itemsSnapshot" as "itemsSnapshot",
        status,
        "createdAt"::text as "createdAt"
      from payment_transactions
      where id = $1::uuid
      limit 1
      `,
      [paymentId],
    );

    const payment = paymentRes.rows[0];
    if (!payment || payment.status !== 'PAID') {
      return null;
    }

    const existing = await this.db.query<{ id: string }>(
      `select id::text as id from paid_conversion_records where payment_transaction_id = $1::uuid limit 1`,
      [paymentId],
    );
    if (existing.rows[0]) {
      return this.findOne(existing.rows[0].id);
    }

    const buyerMember = await this.db.query<{
      id: string;
      name: string;
    }>(
      `select id::text as id, name from members where lower(email) = lower($1) limit 1`,
      [payment.customerEmail],
    );
    const buyer = buyerMember.rows[0];

    const paidAt = payment.createdAt;
    const pic = await this.resolvePicForBuyer({
      buyerMemberId: buyer?.id ?? null,
      buyerEmail: payment.customerEmail,
      at: paidAt,
    });

    const campaignSource = String(payment.attributionSource ?? '').trim() || null;
    const campaignName = campaignSource
      ? await this.lookupCampaignName(campaignSource)
      : null;

    const acquisitionType = this.resolveAcquisitionType(campaignSource, pic);
    const productsSummary = this.buildProductsSummary(payment.itemsSnapshot);

    const insertRes = await this.db.query<{ id: string }>(
      `
      insert into paid_conversion_records (
        event_type,
        payment_transaction_id,
        "orderId",
        buyer_email,
        buyer_name,
        buyer_member_id,
        campaign_source_code,
        campaign_name,
        acquisition_type,
        pic_member_id_snapshot,
        pic_name_snapshot,
        pic_assignment_id_snapshot,
        amount,
        "totalAmount",
        products_summary,
        "itemsSnapshot",
        paid_at
      )
      values ('PAID', $1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9::uuid, $10, $11::uuid, $12, $13, $14, $15::jsonb, $16::timestamptz)
      on conflict (payment_transaction_id) do nothing
      returning id::text as id
      `,
      [
        paymentId,
        payment.orderId,
        payment.customerEmail,
        buyer?.name ?? null,
        buyer?.id ?? null,
        campaignSource,
        campaignName,
        acquisitionType,
        pic?.picMemberId ?? null,
        pic?.resolvedPicName ?? pic?.picName ?? null,
        pic?.id ?? null,
        Number(payment.amount) || 0,
        Number(payment.totalAmount) || 0,
        productsSummary,
        JSON.stringify(payment.itemsSnapshot ?? []),
        paidAt,
      ],
    );

    const insertedId = insertRes.rows[0]?.id;
    if (!insertedId) {
      const again = await this.db.query<{ id: string }>(
        `select id::text as id from paid_conversion_records where payment_transaction_id = $1::uuid limit 1`,
        [paymentId],
      );
      return again.rows[0] ? this.findOne(again.rows[0].id) : null;
    }

    return this.findOne(insertedId);
  }

  /**
   * Idempotent: one SIGNED_IN row per email + campaign when user completes sign-in.
   */
  async recordForSignIn(input: {
    email: string;
    name?: string | null;
    campaignSourceCode?: string | null;
  }): Promise<PaidConversionRecord | null> {
    const buyerEmail = String(input.email ?? '').trim().toLowerCase();
    const campaignSource = await this.resolveCampaignSource(
      input.campaignSourceCode,
    );
    if (!buyerEmail || !campaignSource) {
      return null;
    }

    const existing = await this.db.query<{ id: string }>(
      `
      select id::text as id
      from paid_conversion_records
      where event_type = 'SIGNED_IN'
        and lower(buyer_email) = lower($1)
        and lower(campaign_source_code) = lower($2)
      limit 1
      `,
      [buyerEmail, campaignSource],
    );
    if (existing.rows[0]) {
      return this.findOne(existing.rows[0].id);
    }

    const buyerMember = await this.db.query<{
      id: string;
      name: string;
    }>(
      `select id::text as id, name from members where lower(email) = lower($1) limit 1`,
      [buyerEmail],
    );
    const buyer = buyerMember.rows[0];
    const buyerName =
      String(input.name ?? '').trim() || buyer?.name || buyerEmail.split('@')[0];
    const occurredAt = new Date().toISOString();

    const pic = await this.resolvePicForBuyer({
      buyerMemberId: buyer?.id ?? null,
      buyerEmail,
      at: occurredAt,
    });

    const campaignName = await this.lookupCampaignName(campaignSource);
    const acquisitionType = this.resolveAcquisitionType(campaignSource, pic);
    const orderId = `SIGNIN-${Date.now()}`;

    const insertRes = await this.db.query<{ id: string }>(
      `
      insert into paid_conversion_records (
        event_type,
        "orderId",
        buyer_email,
        buyer_name,
        buyer_member_id,
        campaign_source_code,
        campaign_name,
        acquisition_type,
        pic_member_id_snapshot,
        pic_name_snapshot,
        pic_assignment_id_snapshot,
        amount,
        "totalAmount",
        paid_at
      )
      values ('SIGNED_IN', $1, $2, $3, $4::uuid, $5, $6, $7, $8::uuid, $9, $10::uuid, 0, 0, $11::timestamptz)
      returning id::text as id
      `,
      [
        orderId,
        buyerEmail,
        buyerName,
        buyer?.id ?? null,
        campaignSource,
        campaignName,
        acquisitionType,
        pic?.picMemberId ?? null,
        pic?.resolvedPicName ?? pic?.picName ?? null,
        pic?.id ?? null,
        occurredAt,
      ],
    );

    const insertedId = insertRes.rows[0]?.id;
    if (!insertedId) {
      const again = await this.db.query<{ id: string }>(
        `
        select id::text as id
        from paid_conversion_records
        where event_type = 'SIGNED_IN'
          and lower(buyer_email) = lower($1)
          and lower(campaign_source_code) = lower($2)
        limit 1
        `,
        [buyerEmail, campaignSource],
      );
      return again.rows[0] ? this.findOne(again.rows[0].id) : null;
    }

    return this.findOne(insertedId);
  }

  async assignPic(body: {
    subjectEmail: string;
    subjectMemberId?: string;
    picMemberId?: string;
    picName?: string;
    assignedBy?: string;
    notes?: string;
  }): Promise<{ assignmentId: string }> {
    const subjectEmail = String(body.subjectEmail ?? '').trim();
    if (!subjectEmail) {
      throw new BadRequestException('subjectEmail is required');
    }

    const subjectMemberId =
      body.subjectMemberId?.trim() ||
      (
        await this.db.query<{ id: string }>(
          `select id::text as id from members where lower(email) = lower($1) limit 1`,
          [subjectEmail],
        )
      ).rows[0]?.id ||
      null;

    let picMemberId = body.picMemberId?.trim() || null;
    let picName = String(body.picName ?? '').trim() || null;

    if (picMemberId) {
      const picMember = await this.db.query<{ name: string }>(
        `select name from members where id = $1::uuid limit 1`,
        [picMemberId],
      );
      if (!picMember.rows[0]) {
        throw new NotFoundException('PIC member not found');
      }
      picName = picName || picMember.rows[0].name;
    }

    if (!picMemberId && !picName) {
      throw new BadRequestException('picMemberId or picName is required');
    }

    await this.db.query(
      `
      update pic_assignments
      set effective_to = now(), "updatedAt" = now()
      where effective_to is null
        and (
          ($1::uuid is not null and subject_member_id = $1::uuid)
          or lower(subject_email) = lower($2)
        )
      `,
      [subjectMemberId, subjectEmail],
    );

    const inserted = await this.db.query<{ id: string }>(
      `
      insert into pic_assignments (
        subject_member_id,
        subject_email,
        pic_member_id,
        pic_name,
        assignment_status,
        assigned_by,
        notes
      )
      values ($1::uuid, $2, $3::uuid, $4, 'CONFIRMED', $5, $6)
      returning id::text as id
      `,
      [
        subjectMemberId,
        subjectEmail,
        picMemberId,
        picName,
        body.assignedBy ?? null,
        body.notes ?? null,
      ],
    );

    return { assignmentId: inserted.rows[0]?.id ?? '' };
  }

  private async findOne(id: string): Promise<PaidConversionRecord | null> {
    const res = await this.db.query<Record<string, unknown>>(
      `
      select
        pcr.id::text as id,
        pcr.event_type as "eventType",
        pcr.payment_transaction_id::text as "paymentTransactionId",
        pcr."orderId" as "orderId",
        pcr.buyer_email as "buyerEmail",
        pcr.buyer_name as "buyerName",
        pcr.buyer_member_id::text as "buyerMemberId",
        pcr.campaign_source_code as "campaignSourceCode",
        pcr.campaign_name as "campaignName",
        pcr.acquisition_type as "acquisitionType",
        ${RESOLVED_PIC_MEMBER_ID_SQL} as "picMemberIdSnapshot",
        ${RESOLVED_PIC_NAME_SQL} as "picNameSnapshot",
        pcr.pic_assignment_id_snapshot::text as "picAssignmentIdSnapshot",
        pcr.amount::float8 as amount,
        pcr."totalAmount"::float8 as "totalAmount",
        pcr.products_summary as "productsSummary",
        pcr."itemsSnapshot" as "itemsSnapshot",
        pcr.paid_at::text as "paidAt",
        pcr."createdAt"::text as "createdAt"
      from paid_conversion_records pcr
      ${MEMBER_FACILITATOR_JOINS}
      where pcr.id = $1::uuid
      limit 1
      `,
      [id],
    );
    const row = res.rows[0];
    return row ? this.mapRow(row) : null;
  }

  /**
   * PIC priority: explicit pic_assignments, then CRM facilitator on members (SO truth).
   */
  private async resolvePicForBuyer(input: {
    buyerMemberId: string | null;
    buyerEmail: string;
    at: string;
  }): Promise<ActivePicAssignment | null> {
    const fromAssignment = await this.resolveActivePicAssignment(input);
    if (fromAssignment) {
      return fromAssignment;
    }
    return this.resolvePicFromMemberFacilitator(input);
  }

  private async resolvePicFromMemberFacilitator(input: {
    buyerMemberId: string | null;
    buyerEmail: string;
  }): Promise<ActivePicAssignment | null> {
    const res = await this.db.query<ActivePicAssignment>(
      `
      select
        null::text as id,
        facilitator.id::text as "picMemberId",
        nullif(trim(buyer.facilitator_name), '') as "picName",
        coalesce(
          nullif(trim(buyer.facilitator_name), ''),
          nullif(trim(facilitator.name), '')
        ) as "resolvedPicName"
      from members buyer
      left join members facilitator on (
        btrim(coalesce(buyer."nTagStatus", '')) <> ''
        and (
          facilitator.id::text = buyer."nTagStatus"
          or facilitator.public_id = buyer."nTagStatus"
          or facilitator.user_id = buyer."nTagStatus"
        )
      )
      where (
          ($1::uuid is not null and buyer.id = $1::uuid)
          or lower(trim(buyer.email)) = lower(trim($2))
        )
        and (
          nullif(trim(buyer.facilitator_name), '') is not null
          or facilitator.id is not null
        )
      limit 1
      `,
      [input.buyerMemberId, input.buyerEmail],
    );
    const row = res.rows[0];
    if (!row?.resolvedPicName?.trim()) {
      return null;
    }
    return row;
  }

  private async resolveActivePicAssignment(input: {
    buyerMemberId: string | null;
    buyerEmail: string;
    at: string;
  }): Promise<ActivePicAssignment | null> {
    const res = await this.db.query<ActivePicAssignment>(
      `
      select
        pa.id::text as id,
        pa.pic_member_id::text as "picMemberId",
        pa.pic_name as "picName",
        coalesce(pa.pic_name, pm.name) as "resolvedPicName"
      from pic_assignments pa
      left join members pm on pm.id = pa.pic_member_id
      where pa.effective_to is null
        and pa.effective_from <= $3::timestamptz
        and (
          ($1::uuid is not null and pa.subject_member_id = $1::uuid)
          or lower(pa.subject_email) = lower($2)
        )
      order by pa.effective_from desc
      limit 1
      `,
      [input.buyerMemberId, input.buyerEmail, input.at],
    );
    return res.rows[0] ?? null;
  }

  private async resolveCampaignSource(
    rawSource: string | null | undefined,
  ): Promise<string | null> {
    const normalized = String(rawSource ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    const found = await this.db.query<{ sourceCode: string }>(
      `select "sourceCode" from campaigns where lower("sourceCode") = $1 limit 1`,
      [normalized],
    );
    return found.rows[0]?.sourceCode ?? null;
  }

  private async lookupCampaignName(
    campaignSource: string,
  ): Promise<string | null> {
    const campaignRes = await this.db.query<{ name: string }>(
      `select name from campaigns where lower("sourceCode") = lower($1) limit 1`,
      [campaignSource],
    );
    return campaignRes.rows[0]?.name ?? null;
  }

  private resolveAcquisitionType(
    campaignSource: string | null,
    pic: ActivePicAssignment | null,
  ): string {
    if (campaignSource) return 'CAMPAIGN';
    if (pic?.picMemberId || pic?.picName) return 'PIC_REFERRAL';
    return 'DIRECT';
  }

  private buildProductsSummary(
    items: Array<Record<string, unknown>> | null,
  ): string | null {
    if (!items?.length) return null;
    const names = items
      .map((item) => {
        const name = item.productName ?? item.name ?? item.productId;
        return typeof name === 'string' && name.trim() ? name.trim() : null;
      })
      .filter(Boolean) as string[];
    return names.length ? names.join(', ') : null;
  }

  private mapRow(row: Record<string, unknown>): PaidConversionRecord {
    const eventType = String(row.eventType ?? 'PAID');
    const displayStage: 'LEAD' | 'PAID' =
      eventType === 'PAID' ? 'PAID' : 'LEAD';
    return {
      id: String(row.id ?? ''),
      eventType,
      displayStage,
      lifecycleStage: null,
      hasPaidEvent: eventType === 'PAID',
      hasSignedInEvent: eventType === 'SIGNED_IN',
      memberPublicId: null,
      paymentTransactionId: (row.paymentTransactionId as string | null) ?? null,
      orderId: (row.orderId as string | null) ?? null,
      buyerEmail: String(row.buyerEmail ?? ''),
      buyerName: (row.buyerName as string | null) ?? null,
      buyerMemberId: (row.buyerMemberId as string | null) ?? null,
      campaignSourceCode: (row.campaignSourceCode as string | null) ?? null,
      campaignName: (row.campaignName as string | null) ?? null,
      acquisitionType: String(row.acquisitionType ?? 'DIRECT'),
      picMemberIdSnapshot: (row.picMemberIdSnapshot as string | null) ?? null,
      picNameSnapshot: (row.picNameSnapshot as string | null) ?? null,
      picAssignmentIdSnapshot:
        (row.picAssignmentIdSnapshot as string | null) ?? null,
      amount: Number(row.amount) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      productsSummary: (row.productsSummary as string | null) ?? null,
      itemsSnapshot: (row.itemsSnapshot as unknown[] | null) ?? null,
      paidAt: String(row.paidAt ?? ''),
      createdAt: String(row.createdAt ?? ''),
    };
  }
}
