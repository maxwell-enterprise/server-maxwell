import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../../common/db.service';
import type { ClauseItemDto } from './dto/contracts.dto';
import type { PatchContractInstanceDto } from './dto/contracts.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly db: DbService) {}

  async findAllClauses(): Promise<
    Array<{
      id: string;
      section: string;
      title: string;
      text: string;
      tags?: string[];
    }>
  > {
    const result = await this.db.query<{
      id: string;
      section: string;
      title: string;
      body: string;
      tags: unknown;
    }>(
      `
      select id, section, title, body, tags
      from contract_clause_items
      order by section asc, title asc
      `,
    );
    return result.rows.map((r) => {
      const tags = Array.isArray(r.tags)
        ? (r.tags as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : undefined;
      return {
        id: r.id,
        section: r.section,
        title: r.title,
        text: r.body,
        ...(tags && tags.length > 0 ? { tags } : {}),
      };
    });
  }

  async upsertClauseItems(items: ClauseItemDto[]): Promise<void> {
    for (const item of items) {
      await this.db.query(
        `
        insert into contract_clause_items (id, section, title, body, tags)
        values ($1, $2, $3, $4, coalesce($5::jsonb, '[]'::jsonb))
        on conflict (id) do update set
          section = excluded.section,
          title = excluded.title,
          body = excluded.body,
          tags = excluded.tags,
          "updatedAt" = now()
        `,
        [
          item.id,
          item.section,
          item.title,
          item.text,
          JSON.stringify(item.tags ?? []),
        ],
      );
    }
  }

  async findAllTemplates(): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<{ document: Record<string, unknown> }>(
      `select document from contract_template_documents order by "updatedAt" desc`,
    );
    return result.rows.map((r) => r.document);
  }

  async findTemplateById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.db.query<{ document: Record<string, unknown> }>(
      `select document from contract_template_documents where id = $1`,
      [id],
    );
    return result.rows[0]?.document ?? null;
  }

  async upsertTemplate(doc: Record<string, unknown>): Promise<void> {
    const id = doc.id;
    if (typeof id !== 'string' || !id) {
      throw new ConflictException('Template document must include string id');
    }
    await this.db.query(
      `
      insert into contract_template_documents (id, document)
      values ($1, $2::jsonb)
      on conflict (id) do update set
        document = excluded.document,
        "updatedAt" = now()
      `,
      [id, JSON.stringify(doc)],
    );
  }

  async findAllInstances(): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<{ document: Record<string, unknown> }>(
      `select document from contract_instance_documents order by "updatedAt" desc`,
    );
    return result.rows.map((r) => r.document);
  }

  async upsertInstance(doc: Record<string, unknown>): Promise<void> {
    const id = doc.id;
    if (typeof id !== 'string' || !id) {
      throw new ConflictException('Instance document must include string id');
    }
    await this.db.query(
      `
      insert into contract_instance_documents (id, document)
      values ($1, $2::jsonb)
      on conflict (id) do update set
        document = excluded.document,
        "updatedAt" = now()
      `,
      [id, JSON.stringify(doc)],
    );
  }

  async patchInstance(
    id: string,
    patch: PatchContractInstanceDto,
  ): Promise<Record<string, unknown>> {
    const result = await this.db.query<{ document: Record<string, unknown> }>(
      `select document from contract_instance_documents where id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Contract instance ${id} not found`);
    }
    const merged: Record<string, unknown> = {
      ...row.document,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
    };
    await this.db.query(
      `
      update contract_instance_documents
      set document = $2::jsonb, "updatedAt" = now()
      where id = $1
      `,
      [id, JSON.stringify(merged)],
    );
    return merged;
  }
}
