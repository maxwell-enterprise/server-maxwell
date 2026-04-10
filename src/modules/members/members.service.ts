import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberLifecycleStage } from '../../schemas/enums.schema';
import { DbService } from '../../common/db.service';
import { CreateMemberDto, MemberQueryDto, UpdateMemberDto } from './dto';
import {
  Member,
  MemberAddress,
  MemberEngagement,
  SocialProfile,
} from './entities';

interface MemberRow {
  internalId: string;
  id: string;
  name: string;
  email: string;
  phone: string | null;
  category: string | null;
  scholarship: boolean;
  joinMonth: string | null;
  program: string | null;
  mentorshipDuration: number | string | null;
  nTagStatus: string | null;
  platform: string | null;
  regInUS: boolean;
  lifecycleStage: MemberLifecycleStage;
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  tags: string[] | null;
  address: MemberAddress | null;
  socialProfile: SocialProfile | null;
  birthDate: string | Date | null;
  gender: string | null;
  linkedinUrl: string | null;
  serviceLevel: string | null;
  achievements: unknown[] | null;
  earnedDoneTags: string[] | null;
  engagement: MemberEngagement | null;
  notes: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const LIFECYCLE_ORDER: MemberLifecycleStage[] = [
  'GUEST',
  'IDENTIFIED',
  'PARTICIPANT',
  'MEMBER',
  'CERTIFIED',
  'FACILITATOR',
];

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private readonly db: DbService) {}

  /**
   * Monotonic promotion: sets `lifecycleStage` to `minStage` only if the member is
   * currently on a lower tier. No demotion. Safe when no `members` row exists.
   */
  async promoteLifecycleAtLeastByEmail(
    rawEmail: string,
    minStage: MemberLifecycleStage,
  ): Promise<void> {
    try {
      const email = rawEmail.trim().toLowerCase();
      if (!email) return;

      const res = await this.db.query<{
        internalId: string;
        lifecycleStage: string;
      }>(
        `
        select m.id::text as "internalId", m."lifecycleStage"::text as "lifecycleStage"
        from members m
        where lower(trim(m.email)) = $1
        limit 1
        `,
        [email],
      );
      const row = res.rows[0];
      if (!row) return;

      if (
        this.lifecycleRank(row.lifecycleStage) >= this.lifecycleRank(minStage)
      ) {
        return;
      }

      await this.update(row.internalId, { lifecycleStage: minStage });
    } catch (err) {
      this.logger.warn(
        `promoteLifecycleAtLeastByEmail(${rawEmail}, ${minStage}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Same as {@link promoteLifecycleAtLeastByEmail} but keyed by `members.id` (UUID text).
   * Used when the wallet owner id is the CRM member row id.
   */
  async promoteLifecycleAtLeastByMemberId(
    memberIdText: string,
    minStage: MemberLifecycleStage,
  ): Promise<void> {
    try {
      const id = memberIdText.trim();
      if (!id) return;

      const res = await this.db.query<{ email: string }>(
        `
        select trim(lower(m.email)) as email
        from members m
        where m.id::text = $1
        limit 1
        `,
        [id],
      );
      const email = res.rows[0]?.email;
      if (!email) return;
      await this.promoteLifecycleAtLeastByEmail(email, minStage);
    } catch (err) {
      this.logger.warn(
        `promoteLifecycleAtLeastByMemberId(${memberIdText}, ${minStage}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private lifecycleRank(stage: string): number {
    const key = String(stage ?? '')
      .trim()
      .toUpperCase();
    const idx = LIFECYCLE_ORDER.indexOf(key as MemberLifecycleStage);
    return idx >= 0 ? idx : 0;
  }

  async create(dto: CreateMemberDto): Promise<Member> {
    await this.assertEmailIsAvailable(dto.email);

    const publicId = await this.resolvePublicId(
      dto.id,
      dto.name,
      dto.lifecycleStage,
    );
    const input = this.normalizeCreateInput(dto);

    const result = await this.db.query<MemberRow>(
      `
      insert into members (
        public_id,
        name,
        email,
        phone,
        category,
        scholarship,
        "joinMonth",
        program,
        "mentorshipDuration",
        "nTagStatus",
        platform,
        "regInUS",
        "lifecycleStage",
        company,
        "jobTitle",
        industry,
        tags,
        address,
        "socialProfile",
        "birthDate",
        gender,
        "linkedinUrl",
        "serviceLevel",
        achievements,
        "earnedDoneTags",
        engagement,
        notes,
        "createdAt",
        "updatedAt"
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17::text[],
        $18::jsonb,
        $19::jsonb,
        $20,
        $21,
        $22,
        $23,
        $24::jsonb,
        $25::text[],
        $26::jsonb,
        $27,
        now(),
        now()
      )
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        name,
        email,
        phone,
        category,
        scholarship,
        "joinMonth" as "joinMonth",
        program,
        "mentorshipDuration" as "mentorshipDuration",
        "nTagStatus" as "nTagStatus",
        platform,
        "regInUS" as "regInUS",
        "lifecycleStage" as "lifecycleStage",
        company,
        "jobTitle" as "jobTitle",
        industry,
        tags,
        address,
        "socialProfile" as "socialProfile",
        "birthDate" as "birthDate",
        gender,
        "linkedinUrl" as "linkedinUrl",
        "serviceLevel" as "serviceLevel",
        achievements,
        "earnedDoneTags" as "earnedDoneTags",
        engagement,
        notes,
        "createdAt" as "createdAt",
        "updatedAt" as "updatedAt"
      `,
      [
        publicId,
        input.name,
        input.email,
        input.phone,
        input.category,
        input.scholarship,
        input.joinMonth,
        input.program,
        input.mentorshipDuration,
        input.nTagStatus,
        input.platform,
        input.regInUS,
        input.lifecycleStage,
        input.company,
        input.jobTitle,
        input.industry,
        input.tags,
        JSON.stringify(input.address),
        JSON.stringify(input.socialProfile),
        input.birthDate,
        input.gender,
        input.linkedinUrl,
        input.serviceLevel,
        JSON.stringify(input.achievements),
        input.earnedDoneTags,
        JSON.stringify(input.engagement),
        input.notes,
      ],
    );

    return this.toMember(result.rows[0]);
  }

  async findAll(query: MemberQueryDto): Promise<Member[]> {
    const params: string[] = [];
    const where: string[] = [];

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      where.push(`
        (
          m.name ilike $${params.length}
          or m.email ilike $${params.length}
          or coalesce(m.public_id, m.id::text) ilike $${params.length}
          or coalesce(m.company, '') ilike $${params.length}
        )
      `);
    }

    if (query.lifecycleStage) {
      params.push(query.lifecycleStage);
      where.push(`m."lifecycleStage" = $${params.length}`);
    }

    if (query.platform?.trim()) {
      params.push(query.platform.trim());
      where.push(`m.platform = $${params.length}`);
    }

    if (query.tag?.trim()) {
      params.push(query.tag.trim());
      where.push(`$${params.length} = any(coalesce(m.tags, '{}'::text[]))`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const sortColumns: Record<MemberQueryDto['sortBy'], string> = {
      joinMonth: `m."joinMonth"`,
      name: 'm.name',
      createdAt: `m."createdAt"`,
    };
    const sortBy = sortColumns[query.sortBy];
    const sortOrder = query.sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const result = await this.db.query<MemberRow>(
      `
      select
        m.id::text as "internalId",
        coalesce(m.public_id, m.id::text) as id,
        m.name,
        m.email,
        m.phone,
        m.category,
        m.scholarship,
        m."joinMonth" as "joinMonth",
        m.program,
        m."mentorshipDuration" as "mentorshipDuration",
        m."nTagStatus" as "nTagStatus",
        m.platform,
        m."regInUS" as "regInUS",
        m."lifecycleStage" as "lifecycleStage",
        m.company,
        m."jobTitle" as "jobTitle",
        m.industry,
        m.tags,
        m.address,
        m."socialProfile" as "socialProfile",
        m."birthDate" as "birthDate",
        m.gender,
        m."linkedinUrl" as "linkedinUrl",
        m."serviceLevel" as "serviceLevel",
        m.achievements,
        m."earnedDoneTags" as "earnedDoneTags",
        m.engagement,
        m.notes,
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      ${whereSql}
      order by ${sortBy} ${sortOrder}, m."createdAt" desc
      `,
      params,
    );

    return result.rows.map((row) => this.toMember(row));
  }

  async findOne(identifier: string): Promise<Member> {
    const row = await this.findRowByIdentifier(identifier);
    return this.toMember(row);
  }

  async update(identifier: string, dto: UpdateMemberDto): Promise<Member> {
    const existing = await this.findRowByIdentifier(identifier);

    if (dto.id && dto.id !== existing.id && dto.id !== existing.internalId) {
      throw new BadRequestException('Member ID cannot be changed');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email.toLowerCase()) {
      await this.assertEmailIsAvailable(dto.email, existing.internalId);
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      params.push(dto.name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (dto.email !== undefined) {
      params.push(dto.email.trim().toLowerCase());
      fields.push(`email = $${params.length}`);
    }
    if (dto.phone !== undefined) {
      params.push(dto.phone.trim());
      fields.push(`phone = $${params.length}`);
    }
    if (dto.category !== undefined) {
      params.push(dto.category.trim());
      fields.push(`category = $${params.length}`);
    }
    if (dto.scholarship !== undefined) {
      params.push(dto.scholarship);
      fields.push(`scholarship = $${params.length}`);
    }
    if (dto.joinMonth !== undefined) {
      params.push(this.normalizeJoinMonth(dto.joinMonth));
      fields.push(`"joinMonth" = $${params.length}`);
    }
    if (dto.program !== undefined) {
      params.push(dto.program.trim());
      fields.push(`program = $${params.length}`);
    }
    if (dto.mentorshipDuration !== undefined) {
      params.push(dto.mentorshipDuration);
      fields.push(`"mentorshipDuration" = $${params.length}`);
    }
    if (dto.nTagStatus !== undefined) {
      params.push(dto.nTagStatus.trim());
      fields.push(`"nTagStatus" = $${params.length}`);
    }
    if (dto.platform !== undefined) {
      params.push(dto.platform.trim());
      fields.push(`platform = $${params.length}`);
    }
    if (dto.regInUS !== undefined) {
      params.push(dto.regInUS);
      fields.push(`"regInUS" = $${params.length}`);
    }
    if (dto.lifecycleStage !== undefined) {
      const emailForCoerce =
        dto.email !== undefined ? dto.email : existing.email;
      const coerced = this.coerceGuestLifecycleWhenEmailPresent(
        dto.lifecycleStage,
        emailForCoerce,
      );
      params.push(coerced);
      fields.push(`"lifecycleStage" = $${params.length}`);
    }
    if (dto.company !== undefined) {
      params.push(dto.company?.trim() || null);
      fields.push(`company = $${params.length}`);
    }
    if (dto.jobTitle !== undefined) {
      params.push(dto.jobTitle?.trim() || null);
      fields.push(`"jobTitle" = $${params.length}`);
    }
    if (dto.industry !== undefined) {
      params.push(dto.industry?.trim() || null);
      fields.push(`industry = $${params.length}`);
    }
    if (dto.tags !== undefined) {
      params.push(dto.tags);
      fields.push(`tags = $${params.length}::text[]`);
    }
    if (dto.address !== undefined) {
      params.push(JSON.stringify(dto.address ?? null));
      fields.push(`address = $${params.length}::jsonb`);
    }
    if (dto.socialProfile !== undefined) {
      params.push(JSON.stringify(dto.socialProfile ?? null));
      fields.push(`"socialProfile" = $${params.length}::jsonb`);
    }
    if (dto.birthDate !== undefined) {
      params.push(this.normalizeBirthDate(dto.birthDate));
      fields.push(`"birthDate" = $${params.length}`);
    }
    if (dto.gender !== undefined) {
      params.push(dto.gender?.trim() || null);
      fields.push(`gender = $${params.length}`);
    }
    if (dto.linkedinUrl !== undefined) {
      params.push(dto.linkedinUrl?.trim() || null);
      fields.push(`"linkedinUrl" = $${params.length}`);
    }
    if (dto.serviceLevel !== undefined) {
      params.push(dto.serviceLevel?.trim() || null);
      fields.push(`"serviceLevel" = $${params.length}`);
    }
    if (dto.achievements !== undefined) {
      params.push(JSON.stringify(dto.achievements ?? []));
      fields.push(`achievements = $${params.length}::jsonb`);
    }
    if (dto.earnedDoneTags !== undefined) {
      params.push(dto.earnedDoneTags);
      fields.push(`"earnedDoneTags" = $${params.length}::text[]`);
    }
    if (dto.engagement !== undefined) {
      params.push(JSON.stringify(dto.engagement ?? null));
      fields.push(`engagement = $${params.length}::jsonb`);
    }
    if (dto.notes !== undefined) {
      params.push(dto.notes?.trim() || null);
      fields.push(`notes = $${params.length}`);
    }

    if (!fields.length) {
      return this.toMember(existing);
    }

    params.push(existing.internalId);

    const result = await this.db.query<MemberRow>(
      `
      update members
      set ${fields.join(', ')}, "updatedAt" = now()
      where id = $${params.length}::uuid
      returning
        id::text as "internalId",
        coalesce(public_id, id::text) as id,
        name,
        email,
        phone,
        category,
        scholarship,
        "joinMonth" as "joinMonth",
        program,
        "mentorshipDuration" as "mentorshipDuration",
        "nTagStatus" as "nTagStatus",
        platform,
        "regInUS" as "regInUS",
        "lifecycleStage" as "lifecycleStage",
        company,
        "jobTitle" as "jobTitle",
        industry,
        tags,
        address,
        "socialProfile" as "socialProfile",
        "birthDate" as "birthDate",
        gender,
        "linkedinUrl" as "linkedinUrl",
        "serviceLevel" as "serviceLevel",
        achievements,
        "earnedDoneTags" as "earnedDoneTags",
        engagement,
        notes,
        "createdAt" as "createdAt",
        "updatedAt" as "updatedAt"
      `,
      params,
    );

    return this.toMember(result.rows[0]);
  }

  private async findRowByIdentifier(identifier: string): Promise<MemberRow> {
    const result = await this.db.query<MemberRow>(
      `
      select
        m.id::text as "internalId",
        coalesce(m.public_id, m.id::text) as id,
        m.name,
        m.email,
        m.phone,
        m.category,
        m.scholarship,
        m."joinMonth" as "joinMonth",
        m.program,
        m."mentorshipDuration" as "mentorshipDuration",
        m."nTagStatus" as "nTagStatus",
        m.platform,
        m."regInUS" as "regInUS",
        m."lifecycleStage" as "lifecycleStage",
        m.company,
        m."jobTitle" as "jobTitle",
        m.industry,
        m.tags,
        m.address,
        m."socialProfile" as "socialProfile",
        m."birthDate" as "birthDate",
        m.gender,
        m."linkedinUrl" as "linkedinUrl",
        m."serviceLevel" as "serviceLevel",
        m.achievements,
        m."earnedDoneTags" as "earnedDoneTags",
        m.engagement,
        m.notes,
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      where m.public_id = $1 or m.id::text = $1
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException(`Member ${identifier} not found`);
    }

    return row;
  }

  private async assertEmailIsAvailable(
    email: string,
    excludeInternalId?: string,
  ): Promise<void> {
    const params: string[] = [email.trim().toLowerCase()];
    let sql = `
      select id::text as "internalId"
      from members
      where lower(email) = $1
    `;

    if (excludeInternalId) {
      params.push(excludeInternalId);
      sql += ` and id::text <> $2`;
    }

    const result = await this.db.query<{ internalId: string }>(sql, params);

    if (result.rows[0]) {
      throw new ConflictException(
        `Member email ${email} is already registered`,
      );
    }
  }

  private async resolvePublicId(
    requestedId: string | undefined,
    name: string,
    lifecycleStage: MemberLifecycleStage,
  ): Promise<string> {
    const preferred = requestedId?.trim();

    if (preferred) {
      const existing = await this.db.query<{ exists: boolean }>(
        'select exists(select 1 from members where public_id = $1) as exists',
        [preferred],
      );

      if (existing.rows[0]?.exists) {
        throw new ConflictException(`Member ID ${preferred} already exists`);
      }

      return preferred;
    }

    const prefix = this.getLifecyclePrefix(lifecycleStage);
    const seed = this.slugify(name).slice(0, 6) || 'MEMBER';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${prefix}-${seed}-${Date.now()}${attempt}`;
      const existing = await this.db.query<{ exists: boolean }>(
        'select exists(select 1 from members where public_id = $1) as exists',
        [candidate],
      );

      if (!existing.rows[0]?.exists) {
        return candidate;
      }
    }

    throw new ConflictException('Could not generate unique member ID');
  }

  private coerceGuestLifecycleWhenEmailPresent(
    stage: MemberLifecycleStage,
    email: string,
  ): MemberLifecycleStage {
    const has = email.trim().length > 0;
    if (stage === 'GUEST' && has) return 'IDENTIFIED';
    return stage;
  }

  private normalizeCreateInput(dto: CreateMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const lifecycleStage = this.coerceGuestLifecycleWhenEmailPresent(
      dto.lifecycleStage,
      email,
    );

    return {
      name: dto.name.trim(),
      email,
      phone: dto.phone.trim(),
      category: dto.category.trim() || this.defaultCategory(lifecycleStage),
      scholarship: dto.scholarship,
      joinMonth: this.normalizeJoinMonth(dto.joinMonth),
      program: dto.program.trim(),
      mentorshipDuration: dto.mentorshipDuration,
      nTagStatus: dto.nTagStatus.trim() || 'Not yet',
      platform: dto.platform.trim() || 'Web',
      regInUS: dto.regInUS,
      lifecycleStage,
      company: dto.company?.trim() || null,
      jobTitle: dto.jobTitle?.trim() || null,
      industry: dto.industry?.trim() || null,
      tags: dto.tags,
      address: dto.address ?? null,
      socialProfile: dto.socialProfile ?? null,
      birthDate: this.normalizeBirthDate(dto.birthDate),
      gender: dto.gender?.trim() || null,
      linkedinUrl: dto.linkedinUrl?.trim() || null,
      serviceLevel: dto.serviceLevel?.trim() || null,
      achievements: dto.achievements,
      earnedDoneTags: dto.earnedDoneTags,
      engagement: dto.engagement ?? null,
      notes: dto.notes?.trim() || null,
    };
  }

  private normalizeJoinMonth(value: string): string {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}(-\d{2})/.test(trimmed)) {
      return trimmed.slice(0, 7);
    }

    return trimmed;
  }

  private normalizeBirthDate(value: string | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }

    return value.trim().slice(0, 10);
  }

  private defaultCategory(lifecycleStage: MemberLifecycleStage): string {
    switch (lifecycleStage) {
      case 'PARTICIPANT':
        return 'Participant';
      case 'MEMBER':
      case 'CERTIFIED':
      case 'FACILITATOR':
        return 'Member';
      case 'IDENTIFIED':
      case 'GUEST':
      default:
        return 'Guest';
    }
  }

  private getLifecyclePrefix(lifecycleStage: MemberLifecycleStage): string {
    switch (lifecycleStage) {
      case 'IDENTIFIED':
        return 'LEAD';
      case 'PARTICIPANT':
        return 'PART';
      case 'MEMBER':
        return 'MBR';
      case 'CERTIFIED':
        return 'CERT';
      case 'FACILITATOR':
        return 'FAC';
      case 'GUEST':
      default:
        return 'GST';
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private toMember(row: MemberRow): Member {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? '',
      category: row.category ?? '',
      scholarship: row.scholarship,
      joinMonth: row.joinMonth ?? '',
      program: row.program ?? '',
      mentorshipDuration: Number(row.mentorshipDuration ?? 0),
      nTagStatus: row.nTagStatus ?? '',
      platform: row.platform ?? '',
      regInUS: row.regInUS,
      lifecycleStage: row.lifecycleStage,
      company: row.company ?? undefined,
      jobTitle: row.jobTitle ?? undefined,
      industry: row.industry ?? undefined,
      tags: row.tags ?? [],
      address: row.address ?? undefined,
      socialProfile: row.socialProfile ?? undefined,
      birthDate: this.formatDate(row.birthDate),
      gender: row.gender ?? undefined,
      linkedinUrl: row.linkedinUrl ?? undefined,
      serviceLevel: row.serviceLevel ?? undefined,
      achievements: row.achievements ?? [],
      earnedDoneTags: row.earnedDoneTags ?? [],
      engagement: row.engagement ?? undefined,
      notes: row.notes ?? undefined,
    };
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
}
