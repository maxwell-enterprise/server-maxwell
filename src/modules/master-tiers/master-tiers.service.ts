import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { MasterTier } from './entities';
import {
  CreateMasterTierDto,
  UpdateMasterTierDto,
  MasterTierQueryDto,
} from './dto';

@Injectable()
export class MasterTiersService {
  constructor(private readonly db: DbService) {}

  async create(dto: CreateMasterTierDto): Promise<MasterTier> {
    const result = await this.db.query<MasterTier>(
      `
      insert into ref_master_tiers (
        id, code, name, description, "basePriceIdr", "createdAt"
      )
      values (
        gen_random_uuid(), $1, $2, $3, $4, now()
      )
      returning id, code, name, description, "basePriceIdr", "createdAt"
      `,
      [dto.code, dto.name, dto.description ?? null, dto.basePriceIdr ?? null],
    );
    return result.rows[0];
  }

  async findAll(query: MasterTierQueryDto): Promise<MasterTier[]> {
    const params: any[] = [];
    let whereSql = '';

    if (query.search) {
      params.push(`%${query.search}%`);
      whereSql = `where code ilike $1 or name ilike $1`;
    }

    const result = await this.db.query<MasterTier>(
      `
      select id, code, name, description, "basePriceIdr", "createdAt"
      from ref_master_tiers
      ${whereSql}
      order by "createdAt" desc
      `,
      params,
    );
    return result.rows;
  }

  async update(id: string, dto: UpdateMasterTierDto): Promise<MasterTier> {
    const fields: string[] = [];
    const params: any[] = [];

    if (dto.code !== undefined) {
      params.push(dto.code);
      fields.push(`code = $${params.length}`);
    }
    if (dto.name !== undefined) {
      params.push(dto.name);
      fields.push(`name = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description);
      fields.push(`description = $${params.length}`);
    }
    if (dto.basePriceIdr !== undefined) {
      params.push(dto.basePriceIdr);
      fields.push(`"basePriceIdr" = $${params.length}`);
    }

    if (!fields.length) {
      const res = await this.db.query<MasterTier>(
        `
        select id, code, name, description, "basePriceIdr", "createdAt"
        from ref_master_tiers
        where id = $1
        `,
        [id],
      );
      return res.rows[0];
    }

    params.push(id);
    await this.db.query(
      `
      update ref_master_tiers
      set ${fields.join(', ')}
      where id = $${params.length}
      `,
      params,
    );

    const res = await this.db.query<MasterTier>(
      `
      select id, code, name, description, "basePriceIdr", "createdAt"
      from ref_master_tiers
      where id = $1
      `,
      [id],
    );
    return res.rows[0];
  }

  async remove(id: string): Promise<void> {
    await this.db.query('delete from ref_master_tiers where id = $1', [id]);
  }
}

