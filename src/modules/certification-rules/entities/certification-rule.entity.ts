import type { CertificationLogic } from '../dto/certification-rule.dto';

/** API + FE shape (flattened from `certification_rules` + `criteria` jsonb) */
export interface CertificationRuleRow {
  id: string;
  name: string;
  description: string;
  logic: CertificationLogic;
  requiredTags: string[];
  minCountValue?: number;
  badgeUrl?: string | null;
  isActive: boolean;
  validityPeriodMonths?: number;
  createdAt?: string;
}

interface CriteriaJson {
  logic: CertificationLogic;
  requiredTags: string[];
  minCountValue?: number;
  badgeUrl?: string | null;
  isActive: boolean;
  validityPeriodMonths?: number;
}

export function rowToRule(row: {
  id: string;
  name: string;
  description: string | null;
  criteria: CriteriaJson | string | null;
  createdAt?: string;
}): CertificationRuleRow {
  const criteria =
    typeof row.criteria === 'string'
      ? (JSON.parse(row.criteria) as CriteriaJson)
      : row.criteria || {
          logic: 'REQUIRE_ALL',
          requiredTags: [],
          isActive: true,
        };

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    logic: criteria.logic,
    requiredTags: criteria.requiredTags ?? [],
    minCountValue: criteria.minCountValue,
    badgeUrl: criteria.badgeUrl ?? undefined,
    isActive: criteria.isActive ?? true,
    validityPeriodMonths: criteria.validityPeriodMonths,
    createdAt: row.createdAt,
  };
}

export function buildCriteriaPayload(
  dto: Partial<{
    logic: CertificationLogic;
    requiredTags: string[];
    minCountValue?: number;
    badgeUrl?: string | null;
    isActive: boolean;
    validityPeriodMonths?: number;
  }>,
): CriteriaJson {
  return {
    logic: dto.logic ?? 'REQUIRE_ALL',
    requiredTags: dto.requiredTags ?? [],
    minCountValue: dto.minCountValue,
    badgeUrl: dto.badgeUrl ?? null,
    isActive: dto.isActive ?? true,
    validityPeriodMonths: dto.validityPeriodMonths,
  };
}
