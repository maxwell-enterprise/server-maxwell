import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberLifecycleStage } from '../../schemas/enums.schema';
import { DbService } from '../../common/db.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hasAssignedRole,
  USER_ROLE,
} from '../workspace-identity/user-role.constants';
import {
  CreateMemberDto,
  CreateMemberDtoSchema,
  MemberQueryDto,
  PublicScoutLeadDto,
  UpdateMemberDto,
} from './dto';
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
  domicile: string | null;
  instagram: string | null;
  industry: string | null;
  tags: string[] | null;
  address: MemberAddress | null;
  socialProfile: SocialProfile | null;
  birthDate: string | Date | null;
  gender: string | null;
  linkedinUrl: string | null;
  facilitatorName: string | null;
  facilitatorType: string | null;
  inheritanceChain: string[] | null;
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

  constructor(
    private readonly db: DbService,
    private readonly prisma: PrismaService,
  ) {}

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

  /** Wallet / entitlement owner id (`members.id` as text) for checkout email. */
  async findMemberIdByEmail(rawEmail: string): Promise<string | null> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return null;
    const res = await this.db.query<{ id: string }>(
      `
      select m.id::text as id
      from members m
      where lower(trim(m.email)) = $1
      limit 1
      `,
      [email],
    );
    return res.rows[0]?.id ?? null;
  }

  /** CRM-facing id + name for wallet / membership hub (public_id when set). */
  async findMemberDigestByEmail(
    rawEmail: string,
  ): Promise<{ publicId: string; name: string } | null> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return null;
    const res = await this.db.query<{ publicId: string; name: string }>(
      `
      select
        coalesce(nullif(trim(m.public_id), ''), m.id::text) as "publicId",
        m.name as name
      from members m
      where lower(trim(m.email)) = $1
      limit 1
      `,
      [email],
    );
    const row = res.rows[0];
    if (!row?.publicId) return null;
    return { publicId: row.publicId, name: row.name };
  }

  async hasLifecycleAtLeastByEmail(
    rawEmail: string,
    minStage: MemberLifecycleStage,
  ): Promise<boolean> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return false;
    const res = await this.db.query<{ lifecycleStage: string }>(
      `
      select coalesce(m."lifecycleStage", 'GUEST')::text as "lifecycleStage"
      from members m
      where lower(trim(m.email)) = $1
      limit 1
      `,
      [email],
    );
    const row = res.rows[0];
    if (!row?.lifecycleStage) return false;
    return this.lifecycleRank(row.lifecycleStage) >= this.lifecycleRank(minStage);
  }

  /**
   * Idempotent CRM row for a purchase email (commerce “shadow” / auto-provision).
   * Wallet grants still use Prisma `User.id` when the buyer has a workspace account;
   * this ensures `members` always has a lead for ops/reporting after a paid order.
   */
  /**
   * Mirror Account Settings (`User` profile) into CRM `members` by email.
   * Creates an IDENTIFIED row when missing; never changes lifecycle stage on update.
   */
  async syncFromWorkspaceUserProfile(input: {
    lookupEmail: string;
    fullName: string;
    email: string;
    phone: string;
    jobTitle: string;
    company: string;
    domicile: string;
    instagram?: string | null;
    linkedinUrl?: string | null;
  }): Promise<void> {
    try {
      const lookupEmail = input.lookupEmail.trim().toLowerCase();
      const email = input.email.trim().toLowerCase();
      if (!email.includes('@')) return;

      const phone = input.phone.trim();
      const name = input.fullName.trim().slice(0, 255);
      const jobTitle = input.jobTitle.trim().slice(0, 255);
      const company = input.company.trim().slice(0, 255);
      const domicile = input.domicile.trim().slice(0, 255);
      const instagram = input.instagram?.trim().slice(0, 120) || null;
      const linkedinUrl = input.linkedinUrl?.trim().slice(0, 500) || null;

      const memberId = await this.findMemberIdByEmail(lookupEmail || email);

      const buildAddress = (
        existing?: MemberAddress | null,
      ): MemberAddress => ({
        ...(existing ?? {}),
        city: domicile,
        country: existing?.country?.trim() || 'Indonesia',
      });

      const buildSocialProfile = (
        existing?: SocialProfile | null,
      ): SocialProfile => {
        const profile: SocialProfile = {
          igVerified: existing?.igVerified ?? false,
          igFollowers: existing?.igFollowers ?? 0,
          businessAccounts: existing?.businessAccounts ?? [],
          occupation: existing?.occupation ?? '',
          businessType: existing?.businessType ?? '',
          communities: existing?.communities ?? [],
        };
        if (instagram) {
          profile.instagram = instagram;
        }
        return profile;
      };

      if (memberId) {
        const existing = await this.findOne(memberId);
        await this.update(memberId, {
          name,
          ...(email !== existing.email.trim().toLowerCase() ? { email } : {}),
          phone,
          jobTitle,
          company,
          domicile,
          instagram: instagram ?? undefined,
          linkedinUrl: linkedinUrl ?? undefined,
          address: buildAddress(existing.address),
          socialProfile: buildSocialProfile(existing.socialProfile),
        });
        return;
      }

      const dto = CreateMemberDtoSchema.parse({
        name,
        email,
        phone,
        joinMonth: new Date().toISOString().slice(0, 7),
        lifecycleStage: 'IDENTIFIED',
        platform: 'Workspace',
        company,
        jobTitle,
        domicile,
        instagram: instagram ?? undefined,
        linkedinUrl: linkedinUrl ?? undefined,
        address: buildAddress(),
        socialProfile: buildSocialProfile(),
      });
      await this.create(dto);
    } catch (err) {
      this.logger.warn(
        `syncFromWorkspaceUserProfile(${input.email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async ensureCrmMemberForPurchaseEmail(
    rawEmail: string,
    displayName?: string | null,
  ): Promise<void> {
    const email = rawEmail?.trim().toLowerCase();
    if (!email?.includes('@')) return;
    const existing = await this.findMemberIdByEmail(email);
    if (existing) return;
    try {
      const name = (
        displayName?.trim() ||
        email.split('@')[0] ||
        'Customer'
      ).slice(0, 255);
      const dto = CreateMemberDtoSchema.parse({
        name,
        email,
        phone: '',
        joinMonth: new Date().toISOString().slice(0, 7),
        lifecycleStage: 'IDENTIFIED',
        platform: 'Store',
        program: 'Online purchase',
        facilitatorType: 'INHERIT',
      });
      await this.create(dto);
      this.logger.log(`CRM member provisioned for purchase email ${email}`);
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.warn(
        `ensureCrmMemberForPurchaseEmail(${email}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async ensureCrmMemberForWorkspaceEmail(
    rawEmail: string,
    options?: {
      displayName?: string | null;
      program?: string;
      platform?: string;
    },
  ): Promise<void> {
    const email = rawEmail?.trim().toLowerCase();
    if (!email?.includes('@')) return;
    const existing = await this.findMemberIdByEmail(email);
    if (existing) return;
    try {
      const workspaceUser = await this.prisma.user.findUnique({
        where: { email },
        select: { name: true },
      });
      const name = (
        options?.displayName?.trim() ||
        workspaceUser?.name?.trim() ||
        email.split('@')[0] ||
        'Member'
      ).slice(0, 255);
      const dto = CreateMemberDtoSchema.parse({
        name,
        email,
        phone: '',
        joinMonth: new Date().toISOString().slice(0, 7),
        lifecycleStage: 'IDENTIFIED',
        platform: options?.platform?.trim() || 'Web',
        program: options?.program?.trim() || 'Workspace signup',
      });
      await this.create(dto);
      this.logger.log(`CRM member provisioned for workspace email ${email}`);
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.warn(
        `ensureCrmMemberForWorkspaceEmail(${email}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async createPublicScoutLead(
    dto: PublicScoutLeadDto,
  ): Promise<{ created: boolean; member: Member }> {
    const email = dto.email.trim().toLowerCase();
    const existingId = await this.findMemberIdByEmail(email);

    if (existingId) {
      return {
        created: false,
        member: await this.findOne(existingId),
      };
    }

    const memberDto = CreateMemberDtoSchema.parse({
      name: dto.fullName.trim(),
      email,
      phone: '',
      category: 'Guest',
      scholarship: false,
      joinMonth: new Date().toISOString().slice(0, 7),
      program: 'Leadership Checkup',
      mentorshipDuration: 0,
      nTagStatus: 'Not yet',
      platform: 'Web',
      regInUS: false,
      lifecycleStage: 'GUEST',
      tags: ['Scout_User', 'Landing_Chat'],
      engagement: {
        lastActiveDate: new Date().toISOString(),
        eventsAttendedCount: 0,
        contentCompletionRate: 0,
        communityReputationScore: 0,
        leadScore: 10,
      },
    });

    const member = await this.create(memberDto, {
      preserveGuestLifecycle: true,
    });
    return { created: true, member };
  }

  private lifecycleRank(stage: string): number {
    const key = String(stage ?? '')
      .trim()
      .toUpperCase();
    const idx = LIFECYCLE_ORDER.indexOf(key as MemberLifecycleStage);
    return idx >= 0 ? idx : 0;
  }

  async create(
    dto: CreateMemberDto,
    options?: { preserveGuestLifecycle?: boolean },
  ): Promise<Member> {
    await this.assertEmailIsAvailable(dto.email);

    const publicId = await this.resolvePublicId(
      dto.id,
      dto.name,
      dto.lifecycleStage,
    );
    const input = this.normalizeCreateInput(dto, options);

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
        domicile,
        instagram,
        industry,
        tags,
        address,
        "socialProfile",
        "birthDate",
        gender,
        "linkedinUrl",
        facilitator_name,
        facilitator_type,
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
        $17,
        $18,
        $19::text[],
        $20::jsonb,
        $21::jsonb,
        $22,
        $23,
        $24,
        $25,
        $26::jsonb,
        $27::text[],
        $28::jsonb,
        $29,
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
        domicile,
        instagram,
        industry,
        tags,
        address,
        "socialProfile" as "socialProfile",
        "birthDate" as "birthDate",
        gender,
        "linkedinUrl" as "linkedinUrl",
        facilitator_name as "facilitatorName",
        facilitator_type as "facilitatorType",
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
        input.domicile,
        input.instagram,
        input.industry,
        input.tags,
        JSON.stringify(input.address),
        JSON.stringify(input.socialProfile),
        input.birthDate,
        input.gender,
        input.linkedinUrl,
        input.facilitatorName,
        input.facilitatorType,
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
        m.domicile,
        m.instagram,
        m.industry,
        m.tags,
        m.address,
        m."socialProfile" as "socialProfile",
        m."birthDate" as "birthDate",
        m.gender,
        m."linkedinUrl" as "linkedinUrl",
        m.facilitator_name as "facilitatorName",
        m.facilitator_type as "facilitatorType",
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

  async update(
    identifier: string,
    dto: UpdateMemberDto,
    options?: { preserveExplicitFacilitatorType?: boolean },
  ): Promise<Member> {
    const existing = await this.findRowByIdentifier(identifier);

    if (dto.id && dto.id !== existing.id && dto.id !== existing.internalId) {
      throw new BadRequestException('Member ID cannot be changed');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email.toLowerCase()) {
      await this.assertEmailIsAvailable(dto.email, existing.internalId);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const preserveExplicitFacilitatorType =
      options?.preserveExplicitFacilitatorType === true;
    const requestedFacilitatorName = dto.facilitatorName?.trim() || '';
    let manualFacilitatorName: string | null | undefined;
    let manualFacilitatorType: string | null | undefined;

    if (!preserveExplicitFacilitatorType && dto.facilitatorName !== undefined) {
      if (requestedFacilitatorName) {
        const facilitator = await this.resolveManualFacilitatorByName(
          requestedFacilitatorName,
        );
        const existingFacilitatorName = existing.facilitatorName?.trim() || '';
        const sameFacilitator =
          existingFacilitatorName.toLowerCase() ===
          facilitator.name.trim().toLowerCase();
        manualFacilitatorName = facilitator.name.trim();
        manualFacilitatorType = sameFacilitator
          ? existing.facilitatorType?.trim() || null
          : existingFacilitatorName
            ? 'MOVE'
            : 'ASSIGN';
      }
    }

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
    if (dto.domicile !== undefined) {
      params.push(dto.domicile?.trim() || null);
      fields.push(`domicile = $${params.length}`);
    }
    if (dto.instagram !== undefined) {
      params.push(dto.instagram?.trim() || null);
      fields.push(`instagram = $${params.length}`);
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
    if (dto.facilitatorName !== undefined) {
      params.push(
        preserveExplicitFacilitatorType
          ? requestedFacilitatorName || null
          : manualFacilitatorName ?? null,
      );
      fields.push(`facilitator_name = $${params.length}`);
    }
    if (preserveExplicitFacilitatorType && dto.facilitatorType !== undefined) {
      params.push(dto.facilitatorType?.trim() || null);
      fields.push(`facilitator_type = $${params.length}`);
    }
    if (!preserveExplicitFacilitatorType && manualFacilitatorType !== undefined) {
      params.push(manualFacilitatorType);
      fields.push(`facilitator_type = $${params.length}`);
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
        domicile,
        instagram,
        industry,
        tags,
        address,
        "socialProfile" as "socialProfile",
        "birthDate" as "birthDate",
        gender,
        "linkedinUrl" as "linkedinUrl",
        facilitator_name as "facilitatorName",
        facilitator_type as "facilitatorType",
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
        m.domicile,
        m.instagram,
        m.industry,
        m.tags,
        m.address,
        m."socialProfile" as "socialProfile",
        m."birthDate" as "birthDate",
        m.gender,
        m."linkedinUrl" as "linkedinUrl",
        m.facilitator_name as "facilitatorName",
        m.facilitator_type as "facilitatorType",
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

  private normalizeCreateInput(
    dto: CreateMemberDto,
    options?: { preserveGuestLifecycle?: boolean },
  ) {
    const email = dto.email.trim().toLowerCase();
    const lifecycleStage =
      options?.preserveGuestLifecycle && dto.lifecycleStage === 'GUEST'
        ? 'GUEST'
        : this.coerceGuestLifecycleWhenEmailPresent(dto.lifecycleStage, email);

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
      domicile: dto.domicile?.trim() || null,
      instagram: dto.instagram?.trim() || null,
      industry: dto.industry?.trim() || null,
      tags: dto.tags,
      address: dto.address ?? null,
      socialProfile: dto.socialProfile ?? null,
      birthDate: this.normalizeBirthDate(dto.birthDate),
      gender: dto.gender?.trim() || null,
      linkedinUrl: dto.linkedinUrl?.trim() || null,
      facilitatorName: dto.facilitatorName?.trim() || null,
      facilitatorType:
        dto.facilitatorType?.trim() ||
        (dto.facilitatorName?.trim() ? 'REGISTER' : null),
      inheritanceChain: dto.inheritanceChain ?? null,
      serviceLevel: dto.serviceLevel?.trim() || null,
      achievements: dto.achievements,
      earnedDoneTags: dto.earnedDoneTags,
      engagement: dto.engagement ?? null,
      notes: dto.notes?.trim() || null,
    };
  }

  async claimReferralForEmail(
    rawEmail: string,
    rawRef: string,
  ): Promise<{ applied: boolean; facilitatorName?: string; linkageKey?: string }> {
    const email = rawEmail.trim().toLowerCase();
    const ref = rawRef.trim();
    if (!email || !ref) {
      return { applied: false };
    }

    await this.ensureCrmMemberForWorkspaceEmail(email, {
      program: 'Referral signup',
      platform: 'Web',
    });

    const claimantInternalId = await this.findMemberIdByEmail(email);
    if (!claimantInternalId) {
      return { applied: false };
    }

    const claimantRow = await this.findRowByIdentifier(claimantInternalId);
    const facilitator = await this.resolveReferralFacilitator(ref);
    if (!facilitator) {
      return { applied: false };
    }

    if (
      facilitator.email &&
      facilitator.email.trim().toLowerCase() === email
    ) {
      return { applied: false };
    }

    const sameFacilitator =
      (claimantRow.facilitatorType ?? '').trim().toUpperCase() === 'REFERRAL' &&
      (claimantRow.facilitatorName ?? '').trim() === facilitator.facilitatorName &&
      (claimantRow.nTagStatus ?? '').trim() === facilitator.linkageKey;
    if (sameFacilitator) {
      return {
        applied: false,
        facilitatorName: facilitator.facilitatorName,
        linkageKey: facilitator.linkageKey,
      };
    }

    await this.update(claimantInternalId, {
      facilitatorName: facilitator.facilitatorName,
      facilitatorType: 'REFERRAL',
      nTagStatus: facilitator.linkageKey,
    }, {
      preserveExplicitFacilitatorType: true,
    });

    return {
      applied: true,
      facilitatorName: facilitator.facilitatorName,
      linkageKey: facilitator.linkageKey,
    };
  }

  private normalizeJoinMonth(value?: string): string {
    const trimmed = value?.trim() || '';

    if (!trimmed) {
      return new Date().toISOString().slice(0, 7);
    }

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

  private async resolveReferralFacilitator(
    rawRef: string,
  ): Promise<{ linkageKey: string; facilitatorName: string; email: string | null } | null> {
    const ref = rawRef.trim();
    if (!ref) return null;

    const workspaceUser = await this.prisma.user.findUnique({
      where: { id: ref },
      select: { id: true, name: true, email: true, appRole: true },
    });
    if (workspaceUser?.email) {
      const isFacilitatorByRole =
        hasAssignedRole(workspaceUser.appRole, USER_ROLE.FACILITATOR) ||
        hasAssignedRole(workspaceUser.appRole, USER_ROLE.SUPER_ADMIN);
      const isFacilitatorByLifecycle = await this.hasLifecycleAtLeastByEmail(
        workspaceUser.email,
        'FACILITATOR',
      );
      const isFacilitator = isFacilitatorByRole || isFacilitatorByLifecycle;
      if (isFacilitator) {
        return {
          linkageKey: workspaceUser.id,
          facilitatorName:
            workspaceUser.name?.trim() || workspaceUser.email.trim(),
          email: workspaceUser.email.trim().toLowerCase(),
        };
      }
    }

    const result = await this.db.query<{
      memberId: string;
      name: string;
      email: string | null;
      lifecycleStage: string;
    }>(
      `
      select
        coalesce(nullif(trim(m.public_id), ''), m.id::text) as "memberId",
        m.name,
        m.email,
        coalesce(m."lifecycleStage", 'GUEST')::text as "lifecycleStage"
      from members m
      where m.public_id = $1 or m.id::text = $1
      limit 1
      `,
      [ref],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (this.lifecycleRank(row.lifecycleStage) < this.lifecycleRank('FACILITATOR')) {
      return null;
    }
    return {
      linkageKey: row.memberId,
      facilitatorName: row.name,
      email: row.email?.trim().toLowerCase() || null,
    };
  }

  private async resolveManualFacilitatorByName(
    rawName: string,
  ): Promise<{ id: string; name: string }> {
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Facilitator name is required');
    }

    const result = await this.db.query<{ id: string; name: string }>(
      `
      select
        coalesce(m.public_id, m.id::text) as id,
        m.name
      from members m
      where lower(trim(m.name)) = lower(trim($1))
        and m."lifecycleStage" = 'FACILITATOR'
      order by m."createdAt" desc
      limit 2
      `,
      [name],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(
        'Selected facilitator was not found in FACILITATOR lifecycle',
      );
    }
    if (result.rows.length > 1) {
      throw new BadRequestException(
        'Selected facilitator name is ambiguous. Please use a unique facilitator name.',
      );
    }

    return result.rows[0];
  }

  /**
   * Tribe mentees for a facilitator. Matches `members.nTagStatus` against JWT `sub`
   * and the facilitator's own CRM `public_id` (common when SQL used workspace uuid).
   */
  async getTribeMembers(
    facilitatorUserId: string,
    facilitatorEmail?: string | null,
  ): Promise<TribeDownlineMember[]> {
    const userId = facilitatorUserId?.trim() ?? '';
    const email = facilitatorEmail?.trim().toLowerCase() ?? '';
    if (!userId && !email) return [];

    const result = await this.db.query<TribeDownlineMemberRow>(
      `
      with facilitator_keys as (
        select distinct key from (
          select $1::text as key
          union all
          select coalesce(nullif(trim(f.public_id), ''), f.id::text)
          from members f
          where $2 <> '' and lower(trim(f.email)) = $2
        ) keys(key)
        where key is not null and btrim(key) <> ''
      )
      select
        coalesce(nullif(trim(m.public_id), ''), m.id::text) as "memberId",
        m.name,
        m.email,
        coalesce(m.phone, '') as phone,
        coalesce(m.program, '') as program,
        coalesce(m."joinMonth", '') as "joinMonth",
        coalesce(m."lifecycleStage", 'MEMBER') as "lifecycleStage",
        coalesce(m.tags, '{}'::text[]) as tags,
        m.engagement,
        m.company,
        m."jobTitle" as "jobTitle",
        m.facilitator_name as "facilitatorName",
        m.facilitator_type as "facilitatorType"
      from members m
      where m."nTagStatus" in (select key from facilitator_keys)
      order by m.name asc
      `,
      [userId, email],
    );

    return result.rows.map((row) => this.mapTribeDownlineRow(row));
  }

  async getTribeMentoringSessions(
    facilitatorUserId: string,
    facilitatorEmail?: string | null,
  ): Promise<TribeMentoringSessionRow[]> {
    const userId = facilitatorUserId?.trim() ?? '';
    const email = facilitatorEmail?.trim().toLowerCase() ?? '';
    if (!userId && !email) return [];

    const result = await this.db.query<TribeMentoringSessionRow>(
      `
      with facilitator_keys as (
        select distinct key from (
          select $1::text as key
          union all
          select coalesce(nullif(trim(f.public_id), ''), f.id::text)
          from members f
          where $2 <> '' and lower(trim(f.email)) = $2
        ) keys(key)
        where key is not null and btrim(key) <> ''
      )
      select
        s.id::text as id,
        s."facilitatorId",
        coalesce(s."facilitatorName", '') as "facilitatorName",
        coalesce(s."eventName", '') as "eventName",
        coalesce(s."memberId", '') as "memberId",
        coalesce(s."memberName", '') as "memberName",
        coalesce(s.notes, '') as notes,
        s."createdAt"
      from tribe_mentoring_sessions s
      where s."facilitatorId" in (select key from facilitator_keys)
      order by s."createdAt" desc
      `,
      [userId, email],
    );
    return result.rows;
  }

  private mapTribeDownlineRow(row: TribeDownlineMemberRow): TribeDownlineMember {
    return {
      memberId: row.memberId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      program: row.program,
      joinDate: row.joinMonth,
      lifecycleStage: row.lifecycleStage,
      tags: row.tags ?? [],
      engagement: row.engagement ?? null,
      company: row.company ?? null,
      jobTitle: row.jobTitle ?? null,
      facilitatorName: row.facilitatorName ?? null,
      facilitatorType: row.facilitatorType ?? null,
    };
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
      domicile: row.domicile ?? undefined,
      instagram: row.instagram ?? undefined,
      industry: row.industry ?? undefined,
      tags: row.tags ?? [],
      address: row.address ?? undefined,
      socialProfile: row.socialProfile ?? undefined,
      birthDate: this.formatDate(row.birthDate),
      gender: row.gender ?? undefined,
      linkedinUrl: row.linkedinUrl ?? undefined,
      facilitatorName: row.facilitatorName ?? undefined,
      facilitatorType: row.facilitatorType ?? undefined,
      inheritanceChain: row.inheritanceChain ?? undefined,
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

export interface TribeDownlineMember {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  program: string;
  joinDate: string;
  lifecycleStage: string;
  tags: string[];
  engagement: Record<string, unknown> | null;
  company: string | null;
  jobTitle: string | null;
  facilitatorName: string | null;
  facilitatorType: string | null;
}

interface TribeDownlineMemberRow {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  program: string;
  joinMonth: string;
  lifecycleStage: string;
  tags: string[] | null;
  engagement: Record<string, unknown> | null;
  company: string | null;
  jobTitle: string | null;
  facilitatorName: string | null;
  facilitatorType: string | null;
}

export interface TribeMentoringSessionRow {
  id: string;
  facilitatorId: string;
  facilitatorName: string;
  eventName: string;
  memberId: string;
  memberName: string;
  notes: string;
  createdAt: string | Date;
}
