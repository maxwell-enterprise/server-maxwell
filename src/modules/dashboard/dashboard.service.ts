import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { ExecutiveDashboardQueryDto } from './dto/executive-dashboard-query.dto';

export type ExecutiveDashboardSummary = {
  filters: ExecutiveDashboardQueryDto;
  uniquePrograms: string[];
  members: {
    total: number;
    momPercent: number | null;
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
  ): MemberScope {
    const params: unknown[] = [];
    const clauses: string[] = [];

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
      params.push(query.program);
      clauses.push(`${alias}.program = $${params.length}`);
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

  private percentChange(current: number, previous: number): number | null {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    }
    if (current > 0) {
      return 100;
    }
    return null;
  }

  private async buildMemberMetrics(
    query: ExecutiveDashboardQueryDto,
  ): Promise<NonNullable<ExecutiveDashboardSummary['members']>> {
    const current = this.buildMemberScope(query, 'current');
    const previous = this.buildMemberScope(query, 'previous');

    const [countsRes, growthRes, categoryRes] = await Promise.all([
      this.db.query<{
        total: string;
        prev_total: string;
        scholarship_count: string;
        non_guest_count: string;
        ntag_received_count: string;
        qualified_count: string;
      }>(
        `
        with current_members as (
          select m.*
          from members m
          ${current.whereSql}
        ),
        previous_members as (
          select m.*
          from members m
          ${previous.whereSql}
        )
        select
          (select count(*)::text from current_members) as total,
          (select count(*)::text from previous_members) as prev_total,
          (select count(*)::text from current_members where scholarship = true) as scholarship_count,
          (select count(*)::text from current_members where "lifecycleStage" <> 'GUEST') as non_guest_count,
          (select count(*)::text from current_members where "nTagStatus" = 'Received') as ntag_received_count,
          (select count(*)::text from current_members where 'Qualified' = any(coalesce(tags, '{}'::text[]))) as qualified_count
        `,
        current.params,
      ),
      this.db.query<{ month: string; count: string }>(
        `
        select
          m."joinMonth" as month,
          count(*)::text as count
        from members m
        ${this.toWhereSql([
          ...current.clauses,
          'm."joinMonth" is not null',
          `m."joinMonth" ~ '^\\d{4}-\\d{2}$'`,
        ])}
        group by m."joinMonth"
        order by m."joinMonth" asc
        `,
        current.params,
      ),
      this.db.query<{ name: string; value: string }>(
        `
        select
          coalesce(nullif(trim(m.category), ''), 'Uncategorized') as name,
          count(*)::text as value
        from members m
        ${current.whereSql}
        group by 1
        order by count(*) desc, name asc
        `,
        current.params,
      ),
    ]);

    const row = countsRes.rows[0];
    const total = Number(row?.total ?? 0);
    const prevTotal = Number(row?.prev_total ?? 0);
    const scholarshipCount = Number(row?.scholarship_count ?? 0);
    const nonGuestCount = Number(row?.non_guest_count ?? 0);
    const nTagReceivedCount = Number(row?.ntag_received_count ?? 0);
    const qualifiedCount = Number(row?.qualified_count ?? 0);

    const growthData = this.buildGrowthSeries(
      growthRes.rows.map((entry) => ({
        month: entry.month,
        count: Number(entry.count ?? 0),
      })),
    );

    return {
      total,
      momPercent: this.percentChange(total, prevTotal),
      scholarshipCount,
      scholarshipRate: total > 0 ? (scholarshipCount / total) * 100 : 0,
      nonGuestCount,
      engagementScore: total > 0 ? (nonGuestCount / total) * 100 : 0,
      nTagReceivedCount,
      retentionRate: total > 0 ? (nTagReceivedCount / total) * 100 : 0,
      qualifiedCount,
      qualifiedRate: total > 0 ? (qualifiedCount / total) * 100 : 0,
      growthData,
      categoryData: categoryRes.rows.map((entry) => ({
        name: entry.name,
        value: Number(entry.value ?? 0),
      })),
    };
  }

  private buildGrowthSeries(
    points: Array<{ month: string; count: number }>,
  ): Array<{ name: string; members: number; cumulativeMembers: number }> {
    if (points.length === 0) {
      return [];
    }

    let running = 0;
    return points.map((point) => {
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
    const current = this.buildPaymentScope(query, 'current');
    const previous = this.buildPaymentScope(query, 'previous');

    const [currentRes, previousRes] = await Promise.all([
      this.db.query<{ revenue: string; paying_customers: string }>(
        `
        select
          coalesce(sum("totalAmount"), 0)::text as revenue,
          count(distinct lower(trim("customerEmail")))::text as paying_customers
        from payment_transactions pt
        ${current.whereSql}
        `,
        current.params,
      ),
      this.db.query<{ revenue: string }>(
        `
        select coalesce(sum("totalAmount"), 0)::text as revenue
        from payment_transactions pt
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
