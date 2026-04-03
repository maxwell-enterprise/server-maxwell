import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../../common/db.service';
import {
  CreateCertificationRuleDto,
  UpdateCertificationRuleDto,
  CertificationRuleQueryDto,
} from './dto';
import {
  CertificationRuleRow,
  buildCriteriaPayload,
  rowToRule,
} from './entities';

@Injectable()
export class CertificationRulesService {
  constructor(private readonly db: DbService) {}

  async findAll(query: CertificationRuleQueryDto): Promise<CertificationRuleRow[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      where.push(
        `(r.name ilike $${params.length} or coalesce(r.description, '') ilike $${params.length})`,
      );
    }

    if (typeof query.isActive === 'boolean') {
      params.push(query.isActive);
      where.push(
        `(coalesce(r.criteria->>'isActive', 'true'))::boolean = $${params.length}`,
      );
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const result = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      criteria: Record<string, unknown> | null;
      createdAt: string;
    }>(
      `
      select
        r.id::text as id,
        r.name,
        r.description,
        r.criteria,
        r."createdAt" as "createdAt"
      from certification_rules r
      ${whereSql}
      order by r."createdAt" desc
      `,
      params,
    );

    return result.rows.map((row) => rowToRule(row));
  }

  async findOne(id: string): Promise<CertificationRuleRow> {
    const result = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      criteria: Record<string, unknown> | null;
      createdAt: string;
    }>(
      `
      select
        r.id::text as id,
        r.name,
        r.description,
        r.criteria,
        r."createdAt" as "createdAt"
      from certification_rules r
      where r.id::text = $1
      `,
      [id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Certification rule ${id} not found`);
    }

    return rowToRule(row);
  }

  async create(dto: CreateCertificationRuleDto): Promise<CertificationRuleRow> {
    const criteria = buildCriteriaPayload({
      logic: dto.logic,
      requiredTags: dto.requiredTags,
      minCountValue: dto.minCountValue,
      badgeUrl: dto.badgeUrl,
      isActive: dto.isActive,
      validityPeriodMonths: dto.validityPeriodMonths,
    });

    const result = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      criteria: Record<string, unknown> | null;
      createdAt: string;
    }>(
      `
      insert into certification_rules (name, description, criteria)
      values ($1, $2, $3::jsonb)
      returning
        id::text as id,
        name,
        description,
        criteria,
        "createdAt" as "createdAt"
      `,
      [dto.name.trim(), dto.description?.trim() || null, JSON.stringify(criteria)],
    );

    return rowToRule(result.rows[0]);
  }

  async update(
    id: string,
    dto: UpdateCertificationRuleDto,
  ): Promise<CertificationRuleRow> {
    const existing = await this.findOne(id);
    const mergedCriteria = buildCriteriaPayload({
      logic: dto.logic ?? existing.logic,
      requiredTags: dto.requiredTags ?? existing.requiredTags,
      minCountValue: dto.minCountValue ?? existing.minCountValue,
      badgeUrl:
        dto.badgeUrl !== undefined ? dto.badgeUrl : existing.badgeUrl,
      isActive: dto.isActive ?? existing.isActive,
      validityPeriodMonths:
        dto.validityPeriodMonths ?? existing.validityPeriodMonths,
    });

    const name = dto.name !== undefined ? dto.name.trim() : existing.name;
    const description =
      dto.description !== undefined
        ? dto.description.trim() || null
        : existing.description || null;

    const result = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      criteria: Record<string, unknown> | null;
      createdAt: string;
    }>(
      `
      update certification_rules
      set
        name = $2,
        description = $3,
        criteria = $4::jsonb
      where id::text = $1
      returning
        id::text as id,
        name,
        description,
        criteria,
        "createdAt" as "createdAt"
      `,
      [id, name, description, JSON.stringify(mergedCriteria)],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Certification rule ${id} not found`);
    }

    return rowToRule(row);
  }

  async remove(id: string): Promise<void> {
    const r = await this.db.query(`delete from certification_rules where id::text = $1`, [
      id,
    ]);
    if (r.rowCount === 0) {
      throw new NotFoundException(`Certification rule ${id} not found`);
    }
  }
}
