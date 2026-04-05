import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

/** Mirrors maxwell-refactor CommissionRule. */
export interface CommissionRuleRow {
  id: string;
  name: string;
  description?: string;
  targetProductId: string;
  beneficiaryRole: string;
  beneficiaryBasis: string;
  type: string;
  value: number;
  isActive: boolean;
}

@Injectable()
export class CommissionRulesService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<CommissionRuleRow[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT "feId", name, description, "targetProductId", "beneficiaryRole", "beneficiaryBasis",
              type, value, "isActive"
       FROM fe_commission_rules
       ORDER BY "createdAt" DESC`,
    );
    return result.rows.map((r) => this.toFe(r));
  }

  private toFe(r: Record<string, unknown>): CommissionRuleRow {
    return {
      id: String(r.feId),
      name: String(r.name),
      description:
        r.description != null && String(r.description).length > 0
          ? String(r.description)
          : undefined,
      targetProductId: String(r.targetProductId ?? 'ALL'),
      beneficiaryRole: String(r.beneficiaryRole ?? 'ALL'),
      beneficiaryBasis: String(r.beneficiaryBasis),
      type: String(r.type),
      value: Number(r.value),
      isActive: Boolean(r.isActive),
    };
  }

  async upsert(feId: string, body: Record<string, unknown>): Promise<void> {
    const name = String(body.name ?? 'Rule');
    const description =
      body.description != null ? String(body.description) : null;
    const targetProductId = String(body.targetProductId ?? 'ALL');
    const beneficiaryRole = String(body.beneficiaryRole ?? 'ALL');
    const beneficiaryBasis = String(body.beneficiaryBasis ?? 'DIRECT_REFERRER');
    const type = String(body.type ?? 'PERCENTAGE_ON_SALES');
    const value = Number(body.value ?? 0);
    const isActive = body.isActive !== false;

    await this.db.query(
      `INSERT INTO fe_commission_rules (id, "feId", name, description, "targetProductId", "beneficiaryRole", "beneficiaryBasis", type, value, "isActive")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ("feId") DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         "targetProductId" = EXCLUDED."targetProductId",
         "beneficiaryRole" = EXCLUDED."beneficiaryRole",
         "beneficiaryBasis" = EXCLUDED."beneficiaryBasis",
         type = EXCLUDED.type,
         value = EXCLUDED.value,
         "isActive" = EXCLUDED."isActive",
         "updatedAt" = now()`,
      [
        feId,
        name,
        description,
        targetProductId,
        beneficiaryRole,
        beneficiaryBasis,
        type,
        value,
        isActive,
      ],
    );
  }

  async remove(feId: string): Promise<void> {
    await this.db.query(`DELETE FROM fe_commission_rules WHERE "feId" = $1`, [
      feId,
    ]);
    await this.db.query(`DELETE FROM fe_commission_rules WHERE id::text = $1`, [
      feId,
    ]);
  }
}
