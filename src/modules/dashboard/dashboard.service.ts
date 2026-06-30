import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { ExecutiveDashboardQueryDto } from './dto/executive-dashboard-query.dto';

export type ExecutiveDashboardSummary = {
  filters: ExecutiveDashboardQueryDto;
  uniquePrograms: string[];
  members: {
    /** All members in the filtered cohort (every lifecycle stage). */
    total: number;
    /** MEMBER + CERTIFIED + FACILITATOR within the cohort. */
    activeMemberCount: number;
    momPercent: number | null;
    lifecycleBreakdown: Array<{ stage: string; count: number }>;
    scholarshipCount: number;
    scholarshipRate: number;
    nonGuestCount: number;
    engagementScore: number;
    nTagReceivedCount: number;
    retentionRate: number;
    qualifiedCount: number;
    qualifiedRate: number;
    growthData: Array<{
      name: string;
      members: number;
      cumulativeMembers: number;
    }>;
    categoryData: Array<{ name: string; value: number }>;
  } | null;
  finance: {
    totalPaidRevenue: number;
    momPercent: number | null;
    payingCustomerCount: number;
    avgLtv: number;
  } | null;
};

type MemberScope = {
  whereSql: string;
  params: unknown[];
  clauses: string[];
};

type PaymentFinanceScope = {
  fromSql: string;
  whereSql: string;
  params: unknown[];
};

/** Active member lifecycle stages (subset of full registry). */
const ACTIVE_MEMBER_LIFECYCLE_SQL = `('MEMBER', 'CERTIFIED', 'FACILITATOR')`;

const LIFECYCLE_DISPLAY_ORDER = [
  'GUEST',
  'IDENTIFIED',
  'PARTICIPANT',
  'MEMBER',
  'CERTIFIED',
  'FACILITATOR',
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly db: DbService) {}

  async getExecutiveSummary(
    query: ExecutiveDashboardQueryDto,
    options: { includeMembers: boolean; includeFinance: boolean },
  ): Promise<ExecutiveDashboardSummary> {
    const uniquePrograms = await this.listUniquePrograms();

    const [members, finance] = await Promise.all([
      options.includeMembers
        ? this.buildMemberMetrics(query)
        : Promise.resolve(null),
      options.includeFinance
        ? this.buildFinanceMetrics(query)
        : Promise.resolve(null),
    ]);

    return {
      filters: query,
      uniquePrograms,
      members,
      finance,
    };
  }

  private async listUniquePrograms(): Promise<string[]> {
    const result = await this.db.query<{ program: string }>(
      `
      select distinct trim(program) as program
      from members
      where program is not null and trim(program) <> ''
      order by program asc
      `,
    );
    return result.rows.map((row) => row.program);
  }

  private buildMemberScope(
    query: ExecutiveDashboardQueryDto,
    period: 'current' | 'previous',
    alias = 'm',
    options?: { activeLifecycleOnly?: boolean },
  ): MemberScope {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (options?.activeLifecycleOnly) {
      clauses.push(
        `${alias}."lifecycleStage" in ${ACTIVE_MEMBER_LIFECYCLE_SQL}`,
      );
    }

    const joinDate = `(${alias}."joinMonth" || '-01')::date`;

    if (period === 'current') {
      switch (query.timeRange) {
        case 'LAST_30':
          clauses.push(`${joinDate} >= (CURRENT_DATE - interval '30 days')`);
          break;
        case 'THIS_QUARTER':
          clauses.push(
            `date_trunc('quarter', ${joinDate}) = date_trunc('quarter', CURRENT_DATE)`,
          );
          clauses.push(
            `extract(year from ${joinDate}) = extract(year from CURRENT_DATE)`,
          );
          break;
        case 'YTD':
          clauses.push(
            `extract(year from ${joinDate}) = extract(year from CURRENT_DATE)`,
          );
          break;
        default:
          break;
      }
    } else {
      switch (query.timeRange) {
        case 'LAST_30':
          clauses.push(
            `${joinDate} >= (CURRENT_DATE - interval '60 days')`,
          );
          clauses.push(
            `${joinDate} < (CURRENT_DATE - interval '30 days')`,
          );
          break;
        case 'THIS_QUARTER':
          clauses.push(
            `date_trunc('quarter', ${joinDate}) = date_trunc('quarter', CURRENT_DATE - interval '3 months')`,
          );
          break;
        case 'YTD':
          clauses.push(
            `extract(year from ${joinDate}) = extract(year from CURRENT_DATE) - 1`,
          );
          clauses.push(
            `${joinDate} <= (CURRENT_DATE - interval '1 year')`,
          );
          break;
        default:
          clauses.push(
            `date_trunc('month', ${joinDate}) = date_trunc('month', CURRENT_DATE - interval '1 month')`,
          );
          break;
      }
    }

    if (query.program !== 'ALL') {
      params.push(query.program.trim());
      clauses.push(`trim(${alias}.program) = trim($${params.length}::text)`);
    }

    if (query.region === 'INTL') {
      clauses.push(`${alias}."regInUS" = true`);
    } else if (query.region === 'DOMESTIC') {
      clauses.push(`${alias}."regInUS" = false`);
    }

    const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
    return { whereSql, params, clauses };
  }

  private toWhereSql(clauses: string[]): string {
    return clauses.length ? `where ${clauses.join(' and ')}` : '';
  }

  private buildPaymentScope(
    query: ExecutiveDashboardQueryDto,
    period: 'current' | 'previous',
    alias = 'pt',
  ): MemberScope {
    const params: unknown[] = [];
    const clauses: string[] = [`upper(trim(${alias}.status)) = 'PAID'`];
    const createdAt = `${alias}."createdAt"`;

    if (period === 'current') {
      switch (query.timeRange) {
        case 'LAST_30':
          clauses.push(`${createdAt} >= (CURRENT_TIMESTAMP - interval '30 days')`);
          break;
        case 'THIS_QUARTER':
          clauses.push(
            `date_trunc('quarter', ${createdAt}) = date_trunc('quarter', CURRENT_TIMESTAMP)`,
          );
          break;
        case 'YTD':
          clauses.push(
            `extract(year from ${createdAt}) = extract(year from CURRENT_TIMESTAMP)`,
          );
          break;
        default:
          break;
      }
    } else {
      switch (query.timeRange) {
        case 'LAST_30':
          clauses.push(
            `${createdAt} >= (CURRENT_TIMESTAMP - interval '60 days')`,
          );
          clauses.push(
            `${createdAt} < (CURRENT_TIMESTAMP - interval '30 days')`,
          );
          break;
        case 'THIS_QUARTER':
          clauses.push(
            `date_trunc('quarter', ${createdAt}) = date_trunc('quarter', CURRENT_TIMESTAMP - interval '3 months')`,
          );
          break;
        case 'YTD':
          clauses.push(
            `extract(year from ${createdAt}) = extract(year from CURRENT_TIMESTAMP) - 1`,
          );
          clauses.push(
            `${createdAt} <= (CURRENT_TIMESTAMP - interval '1 year')`,
          );
          break;
        default:
          clauses.push(
            `date_trunc('month', ${createdAt}) = date_trunc('month', CURRENT_TIMESTAMP - interval '1 month')`,
          );
          break;
      }
    }

    const whereSql = this.toWhereSql(clauses);
    return { whereSql, params, clauses };
  }

  private needsMemberFilterForPayments(
    query: ExecutiveDashboardQueryDto,
  ): boolean {
    return query.program !== 'ALL' || query.region !== 'ALL';
  }

  private buildPaymentFinanceScope(
    query: ExecutiveDashboardQueryDto,
    period: 'current' | 'previous',
  ): PaymentFinanceScope {
    const payment = this.buildPaymentScope(query, period);
    if (!this.needsMemberFilterForPayments(query)) {
      return {
        fromSql: 'payment_transactions pt',
        whereSql: payment.whereSql,
        params: payment.params,
      };
    }

    const memberClauses: string[] = [];
    const params = [...payment.params];

    if (query.program !== 'ALL') {
      params.push(query.program.trim());
      memberClauses.push(`trim(m.program) = trim($${params.length}::text)`);
    }
    if (query.region === 'INTL') {
      memberClauses.push(`m."regInUS" = true`);
    } else if (query.region === 'DOMESTIC') {
      memberClauses.push(`m."regInUS" = false`);
    }

    const allClauses = [...payment.clauses, ...memberClauses];

    return {
      fromSql: `
        payment_transactions pt
        inner join members m on (
          lower(trim(m.email)) = lower(trim(pt."customerEmail"))
          or (
            pt."buyerUserId" is not null
            and trim(pt."buyerUserId") <> ''
            and m.id::text = pt."buyerUserId"
          )
        )
      `,
      whereSql: this.toWhereSql(allClauses),
      params,
    };
  }

  private percentChange(current: number, previous: number): number | null {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    }
    if (current > 0) {
      return 100;
    }
    return null;
  }

  private orderLifecycleBreakdown(
    rows: Array<{ stage: string; count: number }>,
  ): Array<{ stage: string; count: number }> {
    const byStage = new Map(rows.map((row) => [row.stage, row.count]));
    const ordered: Array<{ stage: string; count: number }> = [];

    for (const stage of LIFECYCLE_DISPLAY_ORDER) {
      if (byStage.has(stage)) {
        ordered.push({ stage, count: byStage.get(stage) ?? 0 });
        byStage.delete(stage);
      }
    }

    for (const [stage, count] of byStage.entries()) {
      ordered.push({ stage, count });
    }

    return ordered;
  }

  private async buildMemberMetrics(
    query: ExecutiveDashboardQueryDto,
  ): Promise<NonNullable<ExecutiveDashboardSummary['members']>> {
    const currentCohort = this.buildMemberScope(query, 'current');
    const previousCohort = this.buildMemberScope(query, 'previous');
    const currentActive = this.buildMemberScope(query, 'current', 'm', {
      activeLifecycleOnly: true,
    });

    const [countsRes, lifecycleRes, growthRes, categoryRes] = await Promise.all([
      this.db.query<{
        total: string;
        prev_total: string;
        active_count: string;
        scholarship_count: string;
        ntag_received_count: string;
        qualified_count: string;
      }>(
        `
        with current_cohort as (
          select m.*
          from members m
          ${currentCohort.whereSql}
        ),
        previous_cohort as (
          select m.*
          from members m
          ${previousCohort.whereSql}
        ),
        current_active as (
          select m.*
          from members m
          ${currentActive.whereSql}
        )
        select
          (select count(*)::text from current_cohort) as total,
          (select count(*)::text from previous_cohort) as prev_total,
          (select count(*)::text from current_active) as active_count,
          (select count(*)::text from current_cohort where scholarship = true) as scholarship_count,
          (select count(*)::text from current_active where "nTagStatus" = 'Received') as ntag_received_count,
          (select count(*)::text from current_active where 'Qualified' = any(coalesce(tags, '{}'::text[]))) as qualified_count
        `,
        currentCohort.params,
      ),
      this.db.query<{ stage: string; value: string }>(
        `
        select
          coalesce(nullif(trim(m."lifecycleStage"), ''), 'UNKNOWN') as stage,
          count(*)::text as value
        from members m
        ${currentCohort.whereSql}
        group by 1
        `,
        currentCohort.params,
      ),
      this.db.query<{ month: string; count: string }>(
        `
        select
          m."joinMonth" as month,
          count(*)::text as count
        from members m
        ${this.toWhereSql([
          ...currentCohort.clauses,
          'm."joinMonth" is not null',
          `m."joinMonth" ~ '^\\d{4}-\\d{2}$'`,
        ])}
        group by m."joinMonth"
        order by m."joinMonth" asc
        `,
        currentCohort.params,
      ),
      this.db.query<{ name: string; value: string }>(
        `
        select
          coalesce(nullif(trim(m.category), ''), 'Uncategorized') as name,
          count(*)::text as value
        from members m
        ${currentCohort.whereSql}
        group by 1
        order by count(*) desc, name asc
        `,
        currentCohort.params,
      ),
    ]);

    const row = countsRes.rows[0];
    const total = Number(row?.total ?? 0);
    const prevTotal = Number(row?.prev_total ?? 0);
    const activeMemberCount = Number(row?.active_count ?? 0);
    const scholarshipCount = Number(row?.scholarship_count ?? 0);
    const nTagReceivedCount = Number(row?.ntag_received_count ?? 0);
    const qualifiedCount = Number(row?.qualified_count ?? 0);

    const lifecycleBreakdown = this.orderLifecycleBreakdown(
      lifecycleRes.rows.map((entry) => ({
        stage: entry.stage,
        count: Number(entry.value ?? 0),
      })),
    );

    const growthData = this.buildGrowthSeries(
      growthRes.rows.map((entry) => ({
        month: entry.month,
        count: Number(entry.count ?? 0),
      })),
    );

    return {
      total,
      activeMemberCount,
      momPercent: this.percentChange(total, prevTotal),
      lifecycleBreakdown,
      scholarshipCount,
      scholarshipRate: total > 0 ? (scholarshipCount / total) * 100 : 0,
      nonGuestCount: total - (lifecycleBreakdown.find((e) => e.stage === 'GUEST')?.count ?? 0),
      engagementScore:
        total > 0 ? (activeMemberCount / total) * 100 : 0,
      nTagReceivedCount,
      retentionRate:
        activeMemberCount > 0 ? (nTagReceivedCount / activeMemberCount) * 100 : 0,
      qualifiedCount,
      qualifiedRate:
        activeMemberCount > 0 ? (qualifiedCount / activeMemberCount) * 100 : 0,
      growthData,
      categoryData: categoryRes.rows.map((entry) => ({
        name: entry.name,
        value: Number(entry.value ?? 0),
      })),
    };
  }

  private padGrowthTimeline(
    points: Array<{ month: string; count: number }>,
  ): Array<{ month: string; count: number }> {
    if (points.length === 0) {
      return points;
    }

    const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
    if (sorted.length >= 2) {
      return sorted;
    }

    const sole = sorted[0];
    const match = /^(\d{4})-(\d{2})$/.exec(sole.month);
    if (!match) {
      return sorted;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const prev = new Date(year, month - 2, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

    return [
      { month: prevMonth, count: 0 },
      sole,
    ];
  }

  private buildGrowthSeries(
    points: Array<{ month: string; count: number }>,
  ): Array<{ name: string; members: number; cumulativeMembers: number }> {
    const padded = this.padGrowthTimeline(points);
    if (padded.length === 0) {
      return [];
    }

    let running = 0;
    return padded.map((point) => {
      running += point.count;
      return {
        name: point.month,
        members: point.count,
        cumulativeMembers: running,
      };
    });
  }

  private async buildFinanceMetrics(
    query: ExecutiveDashboardQueryDto,
  ): Promise<NonNullable<ExecutiveDashboardSummary['finance']>> {
    const current = this.buildPaymentFinanceScope(query, 'current');
    const previous = this.buildPaymentFinanceScope(query, 'previous');

    const [currentRes, previousRes] = await Promise.all([
      this.db.query<{ revenue: string; paying_customers: string }>(
        `
        select
          coalesce(sum(pt."totalAmount"), 0)::text as revenue,
          count(distinct lower(trim(pt."customerEmail")))::text as paying_customers
        from ${current.fromSql}
        ${current.whereSql}
        `,
        current.params,
      ),
      this.db.query<{ revenue: string }>(
        `
        select coalesce(sum(pt."totalAmount"), 0)::text as revenue
        from ${previous.fromSql}
        ${previous.whereSql}
        `,
        previous.params,
      ),
    ]);

    const totalPaidRevenue = Number(currentRes.rows[0]?.revenue ?? 0);
    const prevRevenue = Number(previousRes.rows[0]?.revenue ?? 0);
    const payingCustomerCount = Number(
      currentRes.rows[0]?.paying_customers ?? 0,
    );

    return {
      totalPaidRevenue,
      momPercent: this.percentChange(totalPaidRevenue, prevRevenue),
      payingCustomerCount,
      avgLtv:
        payingCustomerCount > 0 ? totalPaidRevenue / payingCustomerCount : 0,
    };
  }
}
