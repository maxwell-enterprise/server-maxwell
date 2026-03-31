import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateAccessRuleDto,
  CreateAccessTagDto,
  CreateEventDto,
  CreateGateDto,
  CreateTierDto,
  EventQueryDto,
  UpdateAccessTagDto,
  UpdateEventDto,
} from './dto';
import { DbService } from '../../common/db.service';

type EventType = 'SOLO' | 'CONTAINER' | 'SESSION';
type EventStatus = 'Upcoming' | 'Completed' | 'Cancelled';
type LocationMode = 'OFFLINE' | 'ONLINE' | 'HYBRID';
type AdmissionPolicy =
  | 'PRE_BOOKED'
  | 'OPEN_MEMBER'
  | 'OPEN_PUBLIC'
  | 'ON_SITE_DEDUCTION'
  | 'INVITED_ONLY';

export interface EventSelectionConfig {
  mode: 'BUNDLE' | 'OPTION';
  minSelect: number;
  maxSelect: number;
}

export interface EventGateConfig {
  id: string;
  name: string;
  allowedTiers: string[];
  assignedUserIds: string[];
  isActive: boolean;
}

export interface EventTierDefinition {
  id: string;
  name: string;
  masterCode?: string;
  quota: number;
  quotaSold?: number;
  price?: number;
  grantTagIds: string[];
  bundledTiers?: Array<{
    eventId: string;
    eventName: string;
    tierId: string;
    tierName: string;
  }>;
}

export interface OperationalSession {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface RecurringMeta {
  frequency: string;
  patternDescription: string;
  time: string;
  totalSessions: number;
}

export interface EventContract {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  time?: string;
  location: string;
  locationMode: LocationMode;
  onlineMeetingLink?: string;
  locationMapLink?: string;
  banner_url?: string;
  description?: string;
  capacity: number;
  attendees: number;
  revenue: number;
  status: EventStatus;
  isVisibleInCatalog?: boolean;
  type: EventType;
  parentEventId?: string;
  classId?: string;
  admissionPolicy: AdmissionPolicy;
  creditTags: string[];
  doneTag?: string;
  isRecurring?: boolean;
  recurringMeta?: RecurringMeta;
  selectionConfig?: EventSelectionConfig;
  gates?: EventGateConfig[];
  tiers?: EventTierDefinition[];
  sessions?: OperationalSession[];
}

interface EventRow {
  internalId: string;
  id: string;
  name: string;
  date: string | Date;
  endDate: string | Date | null;
  time: string | null;
  location: string | null;
  locationMode: LocationMode | null;
  onlineMeetingLink: string | null;
  locationMapLink: string | null;
  banner_url: string | null;
  description: string | null;
  capacity: string | number | null;
  attendees: string | number | null;
  revenue: string | number | null;
  status: EventStatus | null;
  isVisibleInCatalog: boolean | null;
  type: EventType;
  parentEventId: string | null;
  classId: string | null;
  admissionPolicy: AdmissionPolicy | null;
  creditTags: string[] | null;
  doneTag: string | null;
  isRecurring: boolean | null;
  recurringMeta: RecurringMeta | null;
  selectionConfig: EventSelectionConfig | null;
  gates: EventGateConfig[] | null;
  tiers: EventTierDefinition[] | null;
  sessions: OperationalSession[] | null;
}

interface AccessTagRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'UNLIMITED' | 'CONSUMABLE' | null;
  usageLimit: string | number | null;
  isActive: boolean;
}

@Injectable()
export class EventsRuntimeService {
  constructor(private readonly db: DbService) {}

  async create(dto: CreateEventDto): Promise<EventContract> {
    const publicId = await this.resolvePublicId(dto.id, dto.name);
    const parentInternalId = await this.resolveEventInternalId(dto.parentEventId);
    const normalized = this.normalizeEventPayload(dto);

    const result = await this.db.query<EventRow>(
      `
      insert into events (
        public_id,
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
        "doneTag",
        "isRecurring",
        "recurringMeta",
        "selectionConfig",
        gates,
        tiers,
        sessions,
        "createdAt",
        "updatedAt"
      )
      values (
        $1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18::uuid, $19, $20,
        $21::text[], $22, $23, $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb,
        now(), now()
      )
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        name,
        date,
        "endDate" as "endDate",
        time,
        location,
        "locationMode" as "locationMode",
        "onlineMeetingLink" as "onlineMeetingLink",
        "locationMapLink" as "locationMapLink",
        banner_url,
        description,
        capacity,
        attendees,
        revenue,
        status,
        "isVisibleInCatalog" as "isVisibleInCatalog",
        type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = events."parentEventId") as "parentEventId",
        "classId" as "classId",
        "admissionPolicy" as "admissionPolicy",
        "creditTags" as "creditTags",
        "doneTag" as "doneTag",
        "isRecurring" as "isRecurring",
        "recurringMeta" as "recurringMeta",
        "selectionConfig" as "selectionConfig",
        gates,
        tiers,
        sessions
      `,
      [
        publicId,
        normalized.name,
        normalized.date,
        normalized.endDate,
        normalized.time,
        normalized.location,
        normalized.locationMode,
        normalized.onlineMeetingLink,
        normalized.locationMapLink,
        normalized.banner_url,
        normalized.description,
        normalized.capacity,
        normalized.attendees,
        normalized.revenue,
        normalized.status,
        normalized.isVisibleInCatalog,
        normalized.type,
        parentInternalId,
        normalized.classId,
        normalized.admissionPolicy,
        normalized.creditTags,
        normalized.doneTag,
        normalized.isRecurring,
        this.toJson(normalized.recurringMeta),
        this.toJson(normalized.selectionConfig),
        this.toJson(normalized.gates),
        this.toJson(normalized.tiers),
        this.toJson(normalized.sessions),
      ],
    );

    return this.toEvent(result.rows[0]);
  }

  async findAll(query: EventQueryDto): Promise<EventContract[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      where.push(`(e.name ilike $${params.length} or coalesce(e.public_id, e.id::text) ilike $${params.length})`);
    }
    if (query.type) {
      params.push(query.type);
      where.push(`e.type = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`e.status = $${params.length}`);
    }
    if (typeof query.isVisibleInCatalog === 'boolean') {
      params.push(query.isVisibleInCatalog);
      where.push(`e."isVisibleInCatalog" = $${params.length}`);
    }
    if (query.year) {
      params.push(`${query.year}%`);
      where.push(`to_char(e.date, 'YYYY-MM-DD') like $${params.length}`);
    }
    if (query.parentEventId?.trim()) {
      const parentInternalId = await this.resolveEventInternalId(query.parentEventId);
      if (!parentInternalId) {
        return [];
      }
      params.push(parentInternalId);
      where.push(`e."parentEventId" = $${params.length}::uuid`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const sortColumns: Record<EventQueryDto['sortBy'], string> = {
      date: 'e.date',
      name: 'e.name',
      createdAt: 'e."createdAt"',
    };
    const sortBy = sortColumns[query.sortBy];
    const sortOrder = query.sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e."endDate" as "endDate",
        e.time,
        e.location,
        e."locationMode" as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink",
        e."locationMapLink" as "locationMapLink",
        e.banner_url,
        e.description,
        e.capacity,
        e.attendees,
        e.revenue,
        e.status,
        e."isVisibleInCatalog" as "isVisibleInCatalog",
        e.type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
        e."classId" as "classId",
        e."admissionPolicy" as "admissionPolicy",
        e."creditTags" as "creditTags",
        e."doneTag" as "doneTag",
        e."isRecurring" as "isRecurring",
        e."recurringMeta" as "recurringMeta",
        e."selectionConfig" as "selectionConfig",
        e.gates,
        e.tiers,
        e.sessions
      from events e
      ${whereSql}
      order by ${sortBy} ${sortOrder}, e."createdAt" desc
      `,
      params,
    );

    return result.rows.map((row) => this.toEvent(row));
  }

  async findOne(identifier: string): Promise<EventContract> {
    const row = await this.findRowByIdentifier(identifier);
    return this.toEvent(row);
  }

  async update(identifier: string, dto: UpdateEventDto): Promise<EventContract> {
    const existing = await this.findRowByIdentifier(identifier);
    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.id && dto.id !== existing.id && dto.id !== existing.internalId) {
      throw new ConflictException('Event ID cannot be changed');
    }
    if (dto.name !== undefined) {
      params.push(dto.name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (dto.date !== undefined) {
      params.push(this.normalizeDate(dto.date));
      fields.push(`date = $${params.length}::date`);
    }
    if (dto.endDate !== undefined) {
      params.push(this.normalizeOptionalDate(dto.endDate));
      fields.push(`"endDate" = $${params.length}::date`);
    }
    if (dto.time !== undefined) {
      params.push(dto.time?.trim() || null);
      fields.push(`time = $${params.length}`);
    }
    if (dto.location !== undefined) {
      params.push(dto.location.trim() || 'TBD');
      fields.push(`location = $${params.length}`);
    }
    if (dto.locationMode !== undefined) {
      params.push(dto.locationMode);
      fields.push(`"locationMode" = $${params.length}`);
    }
    if (dto.onlineMeetingLink !== undefined) {
      params.push(dto.onlineMeetingLink?.trim() || null);
      fields.push(`"onlineMeetingLink" = $${params.length}`);
    }
    if (dto.locationMapLink !== undefined) {
      params.push(dto.locationMapLink?.trim() || null);
      fields.push(`"locationMapLink" = $${params.length}`);
    }
    if (dto.banner_url !== undefined) {
      params.push(dto.banner_url?.trim() || null);
      fields.push(`banner_url = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description?.trim() || null);
      fields.push(`description = $${params.length}`);
    }
    if (dto.capacity !== undefined) {
      params.push(dto.capacity);
      fields.push(`capacity = $${params.length}`);
    }
    if (dto.attendees !== undefined) {
      params.push(dto.attendees);
      fields.push(`attendees = $${params.length}`);
    }
    if (dto.revenue !== undefined) {
      params.push(dto.revenue);
      fields.push(`revenue = $${params.length}`);
    }
    if (dto.status !== undefined) {
      params.push(dto.status);
      fields.push(`status = $${params.length}`);
    }
    if (dto.isVisibleInCatalog !== undefined) {
      params.push(dto.isVisibleInCatalog);
      fields.push(`"isVisibleInCatalog" = $${params.length}`);
    }
    if (dto.type !== undefined) {
      params.push(dto.type);
      fields.push(`type = $${params.length}`);
    }
    if (dto.parentEventId !== undefined) {
      params.push(await this.resolveEventInternalId(dto.parentEventId));
      fields.push(`"parentEventId" = $${params.length}::uuid`);
    }
    if (dto.classId !== undefined) {
      params.push(dto.classId?.trim() || null);
      fields.push(`"classId" = $${params.length}`);
    }
    if (dto.admissionPolicy !== undefined) {
      params.push(dto.admissionPolicy);
      fields.push(`"admissionPolicy" = $${params.length}`);
    }
    if (dto.creditTags !== undefined) {
      params.push(dto.creditTags);
      fields.push(`"creditTags" = $${params.length}::text[]`);
    }
    if (dto.doneTag !== undefined) {
      params.push(dto.doneTag?.trim() || null);
      fields.push(`"doneTag" = $${params.length}`);
    }
    if (dto.isRecurring !== undefined) {
      params.push(dto.isRecurring);
      fields.push(`"isRecurring" = $${params.length}`);
    }
    if (dto.recurringMeta !== undefined) {
      params.push(this.toJson(dto.recurringMeta));
      fields.push(`"recurringMeta" = $${params.length}::jsonb`);
    }
    if (dto.selectionConfig !== undefined) {
      params.push(this.toJson(dto.selectionConfig));
      fields.push(`"selectionConfig" = $${params.length}::jsonb`);
    }
    if (dto.gates !== undefined) {
      params.push(this.toJson(dto.gates));
      fields.push(`gates = $${params.length}::jsonb`);
    }
    if (dto.tiers !== undefined) {
      params.push(this.toJson(dto.tiers));
      fields.push(`tiers = $${params.length}::jsonb`);
    }
    if (dto.sessions !== undefined) {
      params.push(this.toJson(dto.sessions));
      fields.push(`sessions = $${params.length}::jsonb`);
    }

    if (!fields.length) {
      return this.toEvent(existing);
    }

    params.push(existing.internalId);

    const result = await this.db.query<EventRow>(
      `
      update events
      set ${fields.join(', ')}, "updatedAt" = now()
      where id = $${params.length}::uuid
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        name,
        date,
        "endDate" as "endDate",
        time,
        location,
        "locationMode" as "locationMode",
        "onlineMeetingLink" as "onlineMeetingLink",
        "locationMapLink" as "locationMapLink",
        banner_url,
        description,
        capacity,
        attendees,
        revenue,
        status,
        "isVisibleInCatalog" as "isVisibleInCatalog",
        type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = events."parentEventId") as "parentEventId",
        "classId" as "classId",
        "admissionPolicy" as "admissionPolicy",
        "creditTags" as "creditTags",
        "doneTag" as "doneTag",
        "isRecurring" as "isRecurring",
        "recurringMeta" as "recurringMeta",
        "selectionConfig" as "selectionConfig",
        gates,
        tiers,
        sessions
      `,
      params,
    );

    return this.toEvent(result.rows[0]);
  }

  async remove(identifier: string): Promise<void> {
    const existing = await this.findRowByIdentifier(identifier);
    await this.db.query('delete from events where id = $1::uuid', [existing.internalId]);
  }

  async updateStatus(identifier: string, status: string): Promise<EventContract> {
    return this.update(identifier, { status: status as EventStatus });
  }

  async createTier(eventIdentifier: string, dto: CreateTierDto): Promise<EventTierDefinition[]> {
    const event = await this.findOne(eventIdentifier);
    const tiers = [...(event.tiers ?? [])];
    tiers.push({
      ...dto,
      quotaSold: dto.quotaSold ?? 0,
      grantTagIds: dto.grantTagIds ?? [],
    });
    await this.update(eventIdentifier, { tiers });
    return tiers;
  }

  async findTiers(eventIdentifier: string): Promise<EventTierDefinition[]> {
    const event = await this.findOne(eventIdentifier);
    return event.tiers ?? [];
  }

  async createGate(eventIdentifier: string, dto: CreateGateDto): Promise<EventGateConfig[]> {
    const event = await this.findOne(eventIdentifier);
    const gates = [...(event.gates ?? [])];
    gates.push({
      ...dto,
      allowedTiers: dto.allowedTiers ?? [],
      assignedUserIds: dto.assignedUserIds ?? [],
    });
    await this.update(eventIdentifier, { gates });
    return gates;
  }

  async findGates(eventIdentifier: string): Promise<EventGateConfig[]> {
    const event = await this.findOne(eventIdentifier);
    return event.gates ?? [];
  }

  async createTag(dto: CreateAccessTagDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.db.query<{ exists: boolean }>(
      'select exists(select 1 from credit_tags where upper(code) = $1) as exists',
      [code],
    );
    if (existing.rows[0]?.exists) {
      throw new ConflictException(`Access tag ${code} already exists`);
    }

    const result = await this.db.query<AccessTagRow>(
      `
      insert into credit_tags (code, name, description, type, "usageLimit", "isActive")
      values ($1, $2, $3, $4, $5, $6)
      returning
        id::text as id,
        code,
        name,
        description,
        type,
        "usageLimit" as "usageLimit",
        "isActive" as "isActive"
      `,
      [
        code,
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.usageType ?? 'UNLIMITED',
        dto.usageLimit ?? 0,
        dto.isActive ?? true,
      ],
    );

    return this.toAccessTag(result.rows[0]);
  }

  async findAllTags() {
    const result = await this.db.query<AccessTagRow>(
      `
      select
        id::text as id,
        code,
        name,
        description,
        type,
        "usageLimit" as "usageLimit",
        "isActive" as "isActive"
      from credit_tags
      order by code asc
      `,
    );
    return result.rows.map((row) => this.toAccessTag(row));
  }

  async updateTag(tagIdentifier: string, dto: UpdateAccessTagDto) {
    const target = await this.resolveTagRecord(tagIdentifier);
    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.code !== undefined) {
      params.push(dto.code.trim().toUpperCase());
      fields.push(`code = $${params.length}`);
    }
    if (dto.name !== undefined) {
      params.push(dto.name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description?.trim() || null);
      fields.push(`description = $${params.length}`);
    }
    if (dto.usageType !== undefined) {
      params.push(dto.usageType);
      fields.push(`type = $${params.length}`);
    }
    if (dto.usageLimit !== undefined) {
      params.push(dto.usageLimit);
      fields.push(`"usageLimit" = $${params.length}`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      fields.push(`"isActive" = $${params.length}`);
    }

    if (!fields.length) {
      return this.toAccessTag(target);
    }

    params.push(target.id);
    const result = await this.db.query<AccessTagRow>(
      `
      update credit_tags
      set ${fields.join(', ')}
      where id::text = $${params.length}
      returning
        id::text as id,
        code,
        name,
        description,
        type,
        "usageLimit" as "usageLimit",
        "isActive" as "isActive"
      `,
      params,
    );

    return this.toAccessTag(result.rows[0]);
  }

  async removeTag(tagIdentifier: string): Promise<void> {
    const target = await this.resolveTagRecord(tagIdentifier);
    await this.db.query('delete from credit_tags where id::text = $1', [target.id]);
  }

  async createAccessRule(dto: CreateAccessRuleDto) {
    const eventInternalId = await this.resolveRequiredEventInternalId(dto.eventId);
    const tagCode = await this.resolveTagCode(dto.tagId);
    const event = await this.findOne(dto.eventId);
    const creditTags = Array.from(new Set([...(event.creditTags ?? []), tagCode]));

    await this.db.query(
      'update events set "creditTags" = $2::text[], "updatedAt" = now() where id = $1::uuid',
      [eventInternalId, creditTags],
    );

    return {
      id: `${event.id}:${tagCode}:${dto.tierId ?? 'GLOBAL'}`,
      eventId: event.id,
      tagId: tagCode,
      tierId: dto.tierId ?? null,
      usageAmount: dto.usageAmount ?? 1,
      priority: dto.priority ?? 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  }

  async findAccessRules(eventIdentifier: string) {
    const event = await this.findOne(eventIdentifier);
    return (event.creditTags ?? []).map((tagCode, index) => ({
      id: `${event.id}:${tagCode}:GLOBAL`,
      eventId: event.id,
      tagId: tagCode,
      tierId: null,
      usageAmount: 1,
      priority: index,
      isActive: true,
      createdAt: new Date().toISOString(),
    }));
  }

  async findEventsByTag(tagIdentifier: string): Promise<EventContract[]> {
    const tagCode = await this.resolveTagCode(tagIdentifier);
    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e."endDate" as "endDate",
        e.time,
        e.location,
        e."locationMode" as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink",
        e."locationMapLink" as "locationMapLink",
        e.banner_url,
        e.description,
        e.capacity,
        e.attendees,
        e.revenue,
        e.status,
        e."isVisibleInCatalog" as "isVisibleInCatalog",
        e.type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
        e."classId" as "classId",
        e."admissionPolicy" as "admissionPolicy",
        e."creditTags" as "creditTags",
        e."doneTag" as "doneTag",
        e."isRecurring" as "isRecurring",
        e."recurringMeta" as "recurringMeta",
        e."selectionConfig" as "selectionConfig",
        e.gates,
        e.tiers,
        e.sessions
      from events e
      where $1 = any(coalesce(e."creditTags", '{}'::text[]))
      order by e.date asc
      `,
      [tagCode],
    );
    return result.rows.map((row) => this.toEvent(row));
  }

  async getChildEvents(identifier: string): Promise<EventContract[]> {
    const parentInternalId = await this.resolveRequiredEventInternalId(identifier);
    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e."endDate" as "endDate",
        e.time,
        e.location,
        e."locationMode" as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink",
        e."locationMapLink" as "locationMapLink",
        e.banner_url,
        e.description,
        e.capacity,
        e.attendees,
        e.revenue,
        e.status,
        e."isVisibleInCatalog" as "isVisibleInCatalog",
        e.type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
        e."classId" as "classId",
        e."admissionPolicy" as "admissionPolicy",
        e."creditTags" as "creditTags",
        e."doneTag" as "doneTag",
        e."isRecurring" as "isRecurring",
        e."recurringMeta" as "recurringMeta",
        e."selectionConfig" as "selectionConfig",
        e.gates,
        e.tiers,
        e.sessions
      from events e
      where e."parentEventId" = $1::uuid
      order by e.date asc
      `,
      [parentInternalId],
    );
    return result.rows.map((row) => this.toEvent(row));
  }

  async getAttendanceSummary(identifier: string) {
    const event = await this.findOne(identifier);
    const result = await this.db.query<{ count: string }>(
      `
      select count(*)::text as count
      from event_attendance_ledger
      where "eventId" = (
        select id from events where public_id = $1 or id::text = $1
      )
      `,
      [identifier.trim()],
    );
    return {
      eventId: event.id,
      totalCheckedIn: parseInt(result.rows[0]?.count ?? '0', 10),
    };
  }

  private async findRowByIdentifier(identifier: string): Promise<EventRow> {
    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e."endDate" as "endDate",
        e.time,
        e.location,
        e."locationMode" as "locationMode",
        e."onlineMeetingLink" as "onlineMeetingLink",
        e."locationMapLink" as "locationMapLink",
        e.banner_url,
        e.description,
        e.capacity,
        e.attendees,
        e.revenue,
        e.status,
        e."isVisibleInCatalog" as "isVisibleInCatalog",
        e.type,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
        e."classId" as "classId",
        e."admissionPolicy" as "admissionPolicy",
        e."creditTags" as "creditTags",
        e."doneTag" as "doneTag",
        e."isRecurring" as "isRecurring",
        e."recurringMeta" as "recurringMeta",
        e."selectionConfig" as "selectionConfig",
        e.gates,
        e.tiers,
        e.sessions
      from events e
      where e.public_id = $1 or e.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Event ${identifier} not found`);
    }
    return row;
  }

  private normalizeEventPayload(dto: CreateEventDto) {
    return {
      name: dto.name.trim(),
      date: this.normalizeDate(dto.date),
      endDate: this.normalizeOptionalDate(dto.endDate),
      time: dto.time?.trim() || null,
      location: dto.location.trim() || 'TBD',
      locationMode: dto.locationMode,
      onlineMeetingLink: dto.onlineMeetingLink?.trim() || null,
      locationMapLink: dto.locationMapLink?.trim() || null,
      banner_url: dto.banner_url?.trim() || null,
      description: dto.description?.trim() || null,
      capacity: dto.capacity,
      attendees: dto.attendees,
      revenue: dto.revenue,
      status: dto.status,
      isVisibleInCatalog: dto.isVisibleInCatalog,
      type: dto.type,
      classId: dto.classId?.trim() || null,
      admissionPolicy: dto.admissionPolicy,
      creditTags: dto.creditTags,
      doneTag: dto.doneTag?.trim() || null,
      isRecurring: dto.isRecurring,
      recurringMeta: dto.recurringMeta ?? null,
      selectionConfig: dto.selectionConfig ?? null,
      gates: dto.gates ?? [],
      tiers: dto.tiers ?? [],
      sessions: dto.sessions ?? [],
    };
  }

  private toEvent(row: EventRow): EventContract {
    return {
      id: row.id,
      name: row.name,
      date: this.formatDate(row.date) ?? '',
      endDate: this.formatDate(row.endDate),
      time: row.time ?? undefined,
      location: row.location ?? 'TBD',
      locationMode: row.locationMode ?? 'OFFLINE',
      onlineMeetingLink: row.onlineMeetingLink ?? undefined,
      locationMapLink: row.locationMapLink ?? undefined,
      banner_url: row.banner_url ?? undefined,
      description: row.description ?? '',
      capacity: Number(row.capacity ?? 0),
      attendees: Number(row.attendees ?? 0),
      revenue: Number(row.revenue ?? 0),
      status: row.status ?? 'Upcoming',
      isVisibleInCatalog: row.isVisibleInCatalog ?? true,
      type: row.type,
      parentEventId: row.parentEventId ?? undefined,
      classId: row.classId ?? undefined,
      admissionPolicy: row.admissionPolicy ?? 'PRE_BOOKED',
      creditTags: row.creditTags ?? [],
      doneTag: row.doneTag ?? undefined,
      isRecurring: row.isRecurring ?? false,
      recurringMeta: row.recurringMeta ?? undefined,
      selectionConfig: row.selectionConfig ?? undefined,
      gates: row.gates ?? [],
      tiers: row.tiers ?? [],
      sessions: row.sessions ?? [],
    };
  }

  private toAccessTag(row: AccessTagRow) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type === 'CONSUMABLE' ? 'CONSUMABLE_CREDIT' : 'UNLIMITED_ACCESS',
      usageType: row.type ?? 'UNLIMITED',
      usageLimit: Number(row.usageLimit ?? 0),
      category: 'ACCESS',
      isActive: row.isActive,
    };
  }

  private async resolvePublicId(requestedId: string | undefined, name: string): Promise<string> {
    const baseCandidate = requestedId
      ? this.normalizePublicId(requestedId)
      : this.normalizePublicId(`EVT-${name}`);

    let candidate = baseCandidate;
    let suffix = 1;
    while (await this.publicIdExists(candidate)) {
      suffix += 1;
      candidate = `${baseCandidate}-${suffix}`;
    }
    return candidate;
  }

  private normalizePublicId(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }

  private async publicIdExists(publicId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      'select exists(select 1 from events where public_id = $1) as exists',
      [publicId],
    );
    return result.rows[0]?.exists ?? false;
  }

  private async resolveEventInternalId(identifier: string | undefined): Promise<string | null> {
    const trimmed = identifier?.trim();
    if (!trimmed) {
      return null;
    }
    const result = await this.db.query<{ internalId: string }>(
      'select id::text as "internalId" from events where public_id = $1 or id::text = $1 limit 1',
      [trimmed],
    );
    return result.rows[0]?.internalId ?? null;
  }

  private async resolveRequiredEventInternalId(identifier: string): Promise<string> {
    const internalId = await this.resolveEventInternalId(identifier);
    if (!internalId) {
      throw new NotFoundException(`Event ${identifier} not found`);
    }
    return internalId;
  }

  private async resolveTagCode(identifier: string): Promise<string> {
    const trimmed = identifier.trim();
    const result = await this.db.query<{ code: string }>(
      `
      select code
      from credit_tags
      where code = $1 or id::text = $1
      limit 1
      `,
      [trimmed],
    );
    return result.rows[0]?.code ?? trimmed;
  }

  private async resolveTagRecord(identifier: string): Promise<AccessTagRow & { id: string }> {
    const trimmed = identifier.trim();
    const result = await this.db.query<AccessTagRow>(
      `
      select
        id::text as id,
        code,
        name,
        description,
        type,
        "usageLimit" as "usageLimit",
        "isActive" as "isActive"
      from credit_tags
      where code = $1 or id::text = $1
      limit 1
      `,
      [trimmed],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Access tag ${identifier} not found`);
    }
    return row;
  }

  private normalizeDate(value: string): string {
    return value.trim().slice(0, 10);
  }

  private normalizeOptionalDate(value: string | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }
    return value.trim().slice(0, 10);
  }

  private formatDate(value: string | Date | null): string | undefined {
    if (!value) {
      return undefined;
    }
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return value.slice(0, 10);
  }

  private toJson(value: unknown): string {
    return JSON.stringify(value ?? null);
  }
}
