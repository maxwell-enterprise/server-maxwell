/**
 * MAXWELL ERP - Events Service
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  MasterEvent,
  EventTier,
  EventGate,
  MasterAccessTag,
  EventAccessRule,
} from './entities';
import {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  CreateAccessTagDto,
  CreateAccessRuleDto,
  CreateTierDto,
  CreateGateDto,
} from './dto';
import { DbService } from '../../common/db.service';

@Injectable()
export class EventsService {
  constructor(private readonly db: DbService) {}
  // ==========================================================================
  // EVENT CRUD
  // ==========================================================================

  async create(createEventDto: CreateEventDto): Promise<MasterEvent> {
    // Generate slug if not provided
    const slug = createEventDto.slug || this.generateSlug(createEventDto.name);

    // NOTE: table `events` tidak punya kolom slug, jadi kita simpan di metadata JSON.

    const start = createEventDto.startTime;
    const end = createEventDto.endTime;

    if (end <= start) {
      throw new ConflictException('End time must be after start time');
    }

    const dateStr = start.toISOString().slice(0, 10);
    const endDateStr = end.toISOString().slice(0, 10);
    const timeStr = start.toISOString().slice(11, 19);

    const result = await this.db.query<MasterEvent>(
      `
      insert into events (
        name,
        date,
        "endDate",
        time,
        location,
        "locationMode",
        "onlineMeetingLink",
        "locationMapLink",
        banner_url,
        description,
        capacity,
        attendees,
        revenue,
        status,
        "isVisibleInCatalog",
        type,
        "parentEventId",
        "classId",
        "admissionPolicy",
        "creditTags",
        "isRecurring",
        "recurringMeta",
        "selectionConfig",
        gates,
        tiers,
        sessions
      )
      values (
        $1,
        $2::date,
        $3::date,
        $4,
        coalesce($5, 'TBD'),
        'OFFLINE',
        $6,
        $7,
        $8,
        $9,
        $10,
        0,
        0,
        $11,
        true,
        $12,
        $13,
        null,
        'PRE_BOOKED',
        '{}',
        $14,
        $15,
        null,
        null,
        null
      )
      returning id, name, $16::text as slug,
        $17::text as status,
        $18::timestamptz as "startTime",
        $19::timestamptz as "endTime",
        $20::text as type,
        $21::boolean as "isPublic",
        $22::boolean as "isFeatured",
        now() as "createdAt",
        now() as "updatedAt"
      `,
      [
        createEventDto.name,
        dateStr,
        endDateStr,
        timeStr,
        createEventDto.locationName ?? createEventDto.locationCity ?? null,
        createEventDto.onlineMeetingUrl ?? null,
        createEventDto.locationMapsUrl ?? null,
        createEventDto.bannerUrl ?? null,
        createEventDto.description ?? null,
        createEventDto.totalCapacity ?? 0,
        'Upcoming',
        createEventDto.type,
        createEventDto.parentEventId ?? null,
        createEventDto.recurringPattern ? true : false,
        createEventDto.recurringPattern
          ? {
              frequency: createEventDto.recurringPattern,
              patternDescription: null,
              time: timeStr,
              totalSessions: null,
            }
          : null,
        slug,
        'DRAFT',
        createEventDto.startTime.toISOString(),
        createEventDto.endTime.toISOString(),
        createEventDto.type,
        createEventDto.isPublic ?? true,
        createEventDto.isFeatured ?? false,
      ],
    );

    return result.rows[0];
  }

  async findAll(
    query: EventQueryDto,
  ): Promise<{ data: MasterEvent[]; total: number }> {
    const { page, limit, search, type, status, isPublic } = query;
    const params: any[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`e.name ilike $${params.length}`);
    }
    if (type) {
      params.push(type);
      where.push(`e.type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`e.status = $${params.length}`);
    }
    if (typeof isPublic === 'boolean') {
      params.push(isPublic);
      where.push(`e."isVisibleInCatalog" = $${params.length}`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const baseSql = `
      select
        e.id,
        e.name,
        e.date as "startTime",
        coalesce(e."endDate", e.date) as "endTime",
        e.type,
        e.status,
        e."isVisibleInCatalog" as "isPublic",
        e."createdAt" as "createdAt",
        e."updatedAt" as "updatedAt"
      from events e
      ${whereSql}
      order by e.date asc
    `;

    const { rows, total } = await this.db.paginatedQuery<MasterEvent>(
      baseSql,
      params,
      page,
      limit,
    );

    return { data: rows, total };
  }

  async findOne(id: string): Promise<MasterEvent> {
    const result = await this.db.query<MasterEvent>(
      `
      select
        e.id,
        e.name,
        e.date as "startTime",
        coalesce(e."endDate", e.date) as "endTime",
        e.type,
        e.status,
        e."isVisibleInCatalog" as "isPublic",
        e."createdAt" as "createdAt",
        e."updatedAt" as "updatedAt"
      from events e
      where e.id = $1
      `,
      [id],
    );

    const ev = result.rows[0];
    if (!ev) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return ev;
  }

  async findBySlug(slug: string): Promise<MasterEvent | null> {
    // slug disimpan hanya di sisi aplikasi, jadi pencarian berdasarkan nama yang mirip.
    const result = await this.db.query<MasterEvent>(
      `
      select
        e.id,
        e.name,
        e.date as "startTime",
        coalesce(e."endDate", e.date) as "endTime",
        e.type,
        e.status,
        e."isVisibleInCatalog" as "isPublic",
        e."createdAt" as "createdAt",
        e."updatedAt" as "updatedAt"
      from events e
      where lower(replace(e.name, ' ', '-')) = lower($1)
      limit 1
      `,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  async update(
    id: string,
    updateEventDto: UpdateEventDto,
  ): Promise<MasterEvent> {
    await this.findOne(id);

    const fields: string[] = [];
    const params: any[] = [];

    if (updateEventDto.name !== undefined) {
      params.push(updateEventDto.name);
      fields.push(`name = $${params.length}`);
    }
    if (updateEventDto.startTime !== undefined) {
      params.push(updateEventDto.startTime.toISOString().slice(0, 10));
      fields.push(`date = $${params.length}`);
    }
    if (updateEventDto.endTime !== undefined) {
      params.push(updateEventDto.endTime.toISOString().slice(0, 10));
      fields.push(`"endDate" = $${params.length}`);
    }
    if (updateEventDto.description !== undefined) {
      params.push(updateEventDto.description);
      fields.push(`description = $${params.length}`);
    }

    if (!fields.length) {
      return this.findOne(id);
    }

    params.push(id);
    await this.db.query(
      `
      update events
      set ${fields.join(', ')}, "updatedAt" = now()
      where id = $${params.length}
      `,
      params,
    );
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.db.query('delete from events where id = $1', [id]);
  }

  async updateStatus(id: string, status: string): Promise<MasterEvent> {
    await this.findOne(id);
    await this.db.query(
      'update events set status = $1, "updatedAt" = now() where id = $2',
      [status, id],
    );
    return this.findOne(id);
  }

  // ==========================================================================
  // EVENT TIERS
  // ==========================================================================

  async createTier(
    eventId: string,
    createTierDto: CreateTierDto,
  ): Promise<EventTier> {
    await this.findOne(eventId);
    const eventRes = await this.db.query<{ tiers: any[] | null }>(
      'select tiers from events where id = $1',
      [eventId],
    );
    const tiers = (eventRes.rows[0]?.tiers as any[]) ?? [];
    const newTier: EventTier = {
      id: crypto.randomUUID(),
      eventId,
      name: createTierDto.name,
      description: createTierDto.description ?? null,
      capacity: createTierDto.capacity ?? null,
      currentAttendees: 0,
      benefits: createTierDto.benefits ?? [],
      sortOrder: createTierDto.sortOrder ?? 0,
      createdAt: new Date(),
    };
    tiers.push(newTier);
    await this.db.query('update events set tiers = $2 where id = $1', [
      eventId,
      JSON.stringify(tiers),
    ]);
    return newTier;
  }

  async findTiers(eventId: string): Promise<EventTier[]> {
    const result = await this.db.query<{ tiers: any[] | null }>(
      'select tiers from events where id = $1',
      [eventId],
    );
    return (result.rows[0]?.tiers as EventTier[]) ?? [];
  }

  async updateTier(
    id: string,
    updateTierDto: Partial<CreateTierDto>,
  ): Promise<EventTier> {
    // TODO: Update tier
    throw new Error('Not implemented - needs database');
  }

  async removeTier(id: string): Promise<void> {
    // TODO: Delete tier
    throw new Error('Not implemented - needs database');
  }

  // ==========================================================================
  // EVENT GATES
  // ==========================================================================

  async createGate(
    eventId: string,
    createGateDto: CreateGateDto,
  ): Promise<EventGate> {
    await this.findOne(eventId);
    const res = await this.db.query<{ gates: any[] | null }>(
      'select gates from events where id = $1',
      [eventId],
    );
    const gates = (res.rows[0]?.gates as any[]) ?? [];
    const newGate: EventGate = {
      id: crypto.randomUUID(),
      eventId,
      name: createGateDto.name,
      description: createGateDto.description ?? null,
      locationHint: createGateDto.locationHint ?? null,
      allowedTierIds: createGateDto.allowedTierIds ?? [],
      isActive: true,
      createdAt: new Date(),
    };
    gates.push(newGate);
    await this.db.query('update events set gates = $2 where id = $1', [
      eventId,
      JSON.stringify(gates),
    ]);
    return newGate;
  }

  async findGates(eventId: string): Promise<EventGate[]> {
    const result = await this.db.query<{ gates: any[] | null }>(
      'select gates from events where id = $1',
      [eventId],
    );
    return (result.rows[0]?.gates as EventGate[]) ?? [];
  }

  // ==========================================================================
  // ACCESS TAGS (The Key)
  // ==========================================================================

  async createTag(createTagDto: CreateAccessTagDto): Promise<MasterAccessTag> {
    const existing = await this.findTagByCode(createTagDto.code);
    if (existing) {
      throw new ConflictException('Tag code already exists');
    }

    const result = await this.db.query<MasterAccessTag>(
      `
      insert into credit_tags (code, name, description, type, "usageLimit", "isActive")
      values ($1, $2, $3, $4, 0, true)
      returning id, code, name, description,
        'UNLIMITED'::text as "usageType",
        'ACCESS'::text as category,
        null::timestamptz as "validFrom",
        null::timestamptz as "validUntil",
        null::text as "iconUrl",
        null::text as "colorHex",
        true as "isActive",
        now() as "createdAt",
        now() as "updatedAt"
      `,
      [
        createTagDto.code,
        createTagDto.name,
        createTagDto.description ?? null,
        createTagDto.usageType,
      ],
    );
    return result.rows[0];
  }

  async findAllTags(): Promise<MasterAccessTag[]> {
    const result = await this.db.query<MasterAccessTag>(
      `
      select
        id,
        code,
        name,
        description,
        'UNLIMITED'::text as "usageType",
        'ACCESS'::text as category,
        null::timestamptz as "validFrom",
        null::timestamptz as "validUntil",
        null::text as "iconUrl",
        null::text as "colorHex",
        "isActive",
        now() as "createdAt",
        now() as "updatedAt"
      from credit_tags
      `,
    );
    return result.rows;
  }

  async findTagByCode(code: string): Promise<MasterAccessTag | null> {
    const result = await this.db.query<MasterAccessTag>(
      `
      select
        id,
        code,
        name,
        description,
        'UNLIMITED'::text as "usageType",
        'ACCESS'::text as category,
        null::timestamptz as "validFrom",
        null::timestamptz as "validUntil",
        null::text as "iconUrl",
        null::text as "colorHex",
        "isActive",
        now() as "createdAt",
        now() as "updatedAt"
      from credit_tags
      where code = $1
      `,
      [code],
    );
    return result.rows[0] ?? null;
  }

  // ==========================================================================
  // ACCESS RULES (Lock ↔ Key Mapping)
  // ==========================================================================

  async createAccessRule(
    createRuleDto: CreateAccessRuleDto,
  ): Promise<EventAccessRule> {
    // Untuk sekarang, mapping akses disimpan sebagai array string di kolom creditTags pada events.
    const eventRes = await this.db.query<{ creditTags: string[] }>(
      'select "creditTags" from events where id = $1',
      [createRuleDto.eventId],
    );
    const tags = (eventRes.rows[0]?.creditTags ?? []) as string[];
    if (!tags.includes(createRuleDto.tagId)) {
      tags.push(createRuleDto.tagId);
      await this.db.query('update events set "creditTags" = $2 where id = $1', [
        createRuleDto.eventId,
        tags,
      ]);
    }

    const rule: EventAccessRule = {
      id: crypto.randomUUID(),
      eventId: createRuleDto.eventId,
      tagId: createRuleDto.tagId,
      tierId: createRuleDto.tierId ?? null,
      usageAmount: createRuleDto.usageAmount ?? 1,
      priority: createRuleDto.priority ?? 0,
      isActive: true,
      createdAt: new Date(),
    };
    return rule;
  }

  async findAccessRules(eventId: string): Promise<EventAccessRule[]> {
    const res = await this.db.query<{ creditTags: string[] }>(
      'select "creditTags" from events where id = $1',
      [eventId],
    );
    const tags = (res.rows[0]?.creditTags ?? []) as string[];
    return tags.map<EventAccessRule>((tagId) => ({
      id: crypto.randomUUID(),
      eventId,
      tagId,
      tierId: null,
      usageAmount: 1,
      priority: 0,
      isActive: true,
      createdAt: new Date(),
    }));
  }

  async findEventsByTag(tagId: string): Promise<MasterEvent[]> {
    const result = await this.db.query<MasterEvent>(
      `
      select
        e.id,
        e.name,
        e.date as "startTime",
        coalesce(e."endDate", e.date) as "endTime",
        e.type,
        e.status,
        e."isVisibleInCatalog" as "isPublic",
        e."createdAt" as "createdAt",
        e."updatedAt" as "updatedAt"
      from events e
      where $1 = any(e."creditTags")
      `,
      [tagId],
    );
    return result.rows;
  }

  async checkAccess(
    eventId: string,
    tagId: string,
    tierId?: string,
  ): Promise<boolean> {
    const res = await this.db.query<{ creditTags: string[] }>(
      'select "creditTags" from events where id = $1',
      [eventId],
    );
    const tags = (res.rows[0]?.creditTags ?? []) as string[];
    return tags.includes(tagId);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async getChildEvents(parentId: string): Promise<MasterEvent[]> {
    const result = await this.db.query<MasterEvent>(
      `
      select
        e.id,
        e.name,
        e.date as "startTime",
        coalesce(e."endDate", e.date) as "endTime",
        e.type,
        e.status,
        e."isVisibleInCatalog" as "isPublic",
        e."createdAt" as "createdAt",
        e."updatedAt" as "updatedAt"
      from events e
      where e."parentEventId" = $1
      order by e.date asc
      `,
      [parentId],
    );
    return result.rows;
  }

  async getAttendanceSummary(eventId: string) {
    const res = await this.db.query<{
      count: string;
    }>(
      `
      select count(*)::text as count
      from event_attendance_ledger
      where "eventId" = $1
      `,
      [eventId],
    );
    return {
      eventId,
      totalCheckedIn: parseInt(res.rows[0]?.count ?? '0', 10),
    };
  }
}
