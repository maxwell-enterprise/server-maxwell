import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { MasterDoneTag } from './entities';
import {
  CreateMasterDoneTagDto,
  MasterDoneTagQueryDto,
  UpdateMasterDoneTagDto,
} from './dto';

@Injectable()
export class MasterDoneTagsService {
  constructor(private readonly db: DbService) {}

  async create(dto: CreateMasterDoneTagDto): Promise<MasterDoneTag> {
    const result = await this.db.query<MasterDoneTag>(
      `
      insert into master_done_tags (
        code, name, description, category, "createdAt"
      )
      values ($1, $2, $3, $4, now())
      returning
        id::text as id,
        code,
        name as label,
        category,
        description,
        "createdAt" as "createdAt"
      `,
      [
        dto.code.trim().toUpperCase(),
        dto.label.trim(),
        dto.description?.trim() || null,
        dto.category ?? 'CORE',
      ],
    );

    return result.rows[0];
  }

  async findAll(query: MasterDoneTagQueryDto): Promise<MasterDoneTag[]> {
    const params: unknown[] = [];
    let whereSql = '';

    if (query.search) {
      params.push(`%${query.search}%`);
      whereSql = `where code ilike $1 or name ilike $1`;
    }

    const result = await this.db.query<MasterDoneTag>(
      `
      select
        id::text as id,
        code,
        name as label,
        category,
        description,
        "createdAt" as "createdAt"
      from master_done_tags
      ${whereSql}
      order by "createdAt" desc
      `,
      params,
    );

    return result.rows;
  }

  async update(
    id: string,
    dto: UpdateMasterDoneTagDto,
  ): Promise<MasterDoneTag> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.code !== undefined) {
      params.push(dto.code.trim().toUpperCase());
      fields.push(`code = $${params.length}`);
    }
    if (dto.label !== undefined) {
      params.push(dto.label.trim());
      fields.push(`name = $${params.length}`);
    }
    if (dto.category !== undefined) {
      params.push(dto.category);
      fields.push(`category = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description?.trim() || null);
      fields.push(`description = $${params.length}`);
    }

    if (fields.length) {
      params.push(id);
      await this.db.query(
        `
        update master_done_tags
        set ${fields.join(', ')}
        where id::text = $${params.length}
        `,
        params,
      );
    }

    const result = await this.db.query<MasterDoneTag>(
      `
      select
        id::text as id,
        code,
        name as label,
        category,
        description,
        "createdAt" as "createdAt"
      from master_done_tags
      where id::text = $1
      `,
      [id],
    );

    return result.rows[0];
  }

  async remove(id: string): Promise<void> {
    await this.db.query('delete from master_done_tags where id::text = $1', [
      id,
    ]);
  }
}
