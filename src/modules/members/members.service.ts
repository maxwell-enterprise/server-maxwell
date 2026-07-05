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
  phoneNormalizeSql,
  normalizePhone,
  workspaceUserPhoneSql,
  workspaceUserPhoneNormalizeSql,
} from '../../common/phone/normalize-phone';
import {
  Member,
  MemberAddress,
  MemberEngagement,
  SocialProfile,
} from './entities';

interface MemberRow {
  internalId: string;
  id: string;
  userId: string | null;
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

const TRIBE_MEMBER_NOTE_EVENT = '__TRIBE_MEMBER_NOTE__';

export type WorkspaceUserContact = {
  userId: string;
  name: string;
  email: string;
  phone: string;
};

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

  /** CRM member internal id linked to a workspace user. */
  async findMemberIdByUserId(rawUserId: string): Promise<string | null> {
    const userId = rawUserId.trim();
    if (!userId) return null;
    const res = await this.db.query<{ id: string }>(
      `
      select m.id::text as id
      from members m
      where m.user_id = $1
      limit 1
      `,
      [userId],
    );
    return res.rows[0]?.id ?? null;
  }

  async linkMemberToWorkspaceUser(
    memberInternalId: string,
    workspaceUserId: string,
  ): Promise<void> {
    const memberId = memberInternalId.trim();
    const userId = workspaceUserId.trim();
    if (!memberId || !userId) return;

    await this.db.query(
      `
      update members
      set user_id = null, "updatedAt" = now()
      where user_id = $1
        and id::text <> $2
      `,
      [userId, memberId],
    );
    await this.db.query(
      `
      update members
      set user_id = $1, "updatedAt" = now()
      where id::text = $2
      `,
      [userId, memberId],
    );
  }

  async getWorkspaceUserContact(
    rawUserId: string,
  ): Promise<WorkspaceUserContact | null> {
    const userId = rawUserId.trim();
    if (!userId) return null;

    const res = await this.db.query<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      abacContext: unknown;
    }>(
      `
      select
        u.id,
        u.name,
        u.email,
        u.phone,
        u."abacContext" as "abacContext"
      from "User" u
      where u.id = $1
      limit 1
      `,
      [userId],
    );
    const row = res.rows[0];
    if (!row?.id) return null;

    const email = row.email?.trim().toLowerCase() || '';
    const phone = this.readWorkspaceProfilePhone({
      phone: row.phone,
      abacContext: row.abacContext,
    });
    const name =
      row.name?.trim() ||
      (email ? email.split('@')[0] : '') ||
      'User';

    return {
      userId: row.id,
      name,
      email,
      phone,
    };
  }

  /** Resolve workspace user by phone first, then email (canonical account contact). */
  async resolveWorkspaceUserByContact(input: {
    phone?: string | null;
    email?: string | null;
  }): Promise<{ user: WorkspaceUserContact; matchedBy: 'phone' | 'email' } | null> {
    const phone = input.phone?.trim() ?? '';
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      const phoneExpr = workspaceUserPhoneNormalizeSql('u');
      const byPhone = await this.db.query<{
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        abacContext: unknown;
      }>(
        `
        select
          u.id,
          u.name,
          u.email,
          u.phone,
          u."abacContext" as "abacContext"
        from "User" u
        where btrim(${workspaceUserPhoneSql('u')}) <> ''
          and (${phoneExpr}) = $1
        limit 1
        `,
        [normalizedPhone],
      );
      const row = byPhone.rows[0];
      if (row?.id) {
        const email = row.email?.trim().toLowerCase() || '';
        return {
          matchedBy: 'phone',
          user: {
            userId: row.id,
            name:
              row.name?.trim() ||
              (email ? email.split('@')[0] : '') ||
              'User',
            email,
            phone: this.readWorkspaceProfilePhone({
              phone: row.phone,
              abacContext: row.abacContext,
            }),
          },
        };
      }
    }

    const email = input.email?.trim().toLowerCase() ?? '';
    if (email) {
      const byEmail = await this.db.query<{
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        abacContext: unknown;
      }>(
        `
        select
          u.id,
          u.name,
          u.email,
          u.phone,
          u."abacContext" as "abacContext"
        from "User" u
        where lower(trim(u.email)) = $1
        limit 1
        `,
        [email],
      );
      const row = byEmail.rows[0];
      if (row?.id) {
        return {
          matchedBy: 'email',
          user: {
            userId: row.id,
            name:
              row.name?.trim() ||
              email.split('@')[0] ||
              'User',
            email,
            phone: this.readWorkspaceProfilePhone({
              phone: row.phone,
              abacContext: row.abacContext,
            }),
          },
        };
      }
    }

    return null;
  }

  async promoteLifecycleAtLeastByUserId(
    rawUserId: string,
    minStage: MemberLifecycleStage,
  ): Promise<void> {
    try {
      const userId = rawUserId.trim();
      if (!userId) return;

      const memberId = await this.findMemberIdByUserId(userId);
      if (memberId) {
        await this.promoteLifecycleAtLeastByMemberId(memberId, minStage);
        return;
      }

      const contact = await this.getWorkspaceUserContact(userId);
      if (contact?.email) {
        await this.promoteLifecycleAtLeastByEmail(contact.email, minStage);
      }
    } catch (err) {
      this.logger.warn(
        `promoteLifecycleAtLeastByUserId(${rawUserId}, ${minStage}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** CRM member id matched by normalized phone (most recently updated wins). */
  async findMemberIdByPhone(rawPhone: string): Promise<string | null> {
    const normalized = normalizePhone(rawPhone);
    if (!normalized) return null;
    const res = await this.db.query<{ id: string }>(
      `
      select m.id::text as id
      from members m
      where btrim(coalesce(m.phone, '')) <> ''
        and (${phoneNormalizeSql('m')}) = $1
      order by m."updatedAt" desc, m."createdAt" desc
      limit 1
      `,
      [normalized],
    );
    return res.rows[0]?.id ?? null;
  }

  /**
   * Resolve CRM member for form/contact sync: phone match first, then email.
   */
  async resolveMemberIdByContact(input: {
    phone?: string | null;
    email?: string | null;
  }): Promise<{ id: string; matchedBy: 'phone' | 'email' } | null> {
    const phone = input.phone?.trim() ?? '';
    if (phone) {
      const byPhone = await this.findMemberIdByPhone(phone);
      if (byPhone) {
        return { id: byPhone, matchedBy: 'phone' };
      }
    }

    const email = input.email?.trim().toLowerCase() ?? '';
    if (email) {
      const byEmail = await this.findMemberIdByEmail(email);
      if (byEmail) {
        return { id: byEmail, matchedBy: 'email' };
      }
    }

    return null;
  }

  private readWorkspaceProfilePhone(input: {
    phone?: string | null;
    abacContext?: unknown;
  }): string {
    const columnPhone = input.phone?.trim() ?? '';
    if (columnPhone) return columnPhone;

    const abac = input.abacContext;
    if (!abac || typeof abac !== 'object' || Array.isArray(abac)) return '';
    const selfProfile = (abac as Record<string, unknown>).selfProfile;
    if (
      !selfProfile ||
      typeof selfProfile !== 'object' ||
      Array.isArray(selfProfile)
    ) {
      return '';
    }
    const legacyPhone = (selfProfile as Record<string, unknown>).phone;
    return typeof legacyPhone === 'string' && legacyPhone.trim()
      ? legacyPhone.trim()
      : '';
  }

  /**
   * JWT-authenticated form submit: canonical contact from workspace User.
   * @deprecated Prefer {@link resolveFormRespondentContext} for full form submit flow.
   */
  async resolveAuthenticatedFormRespondentContact(input: {
    userId: string;
    email: string;
  }): Promise<{
    workspaceUserId: string;
    memberId: string | null;
    userName: string;
    userEmail: string;
    userPhone: string;
  }> {
    const ctx = await this.resolveFormRespondentContact({
      workspaceUserId: input.userId,
      guestEmail: input.email,
      upsertCrmLead: false,
    });
    return {
      workspaceUserId: ctx.workspaceUserId ?? input.userId.trim(),
      memberId: ctx.memberId,
      userName: ctx.userName,
      userEmail: ctx.userEmail,
      userPhone: ctx.userPhone,
    };
  }

  /**
   * Form respondent: workspace `User` is checked first (by id, then phone, then email).
   * CRM `members` is a side effect for pipeline/tags — never the source of canonical contact.
   */
  async resolveFormRespondentContext(input: {
    workspaceUserId?: string | null;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    formTitle?: string;
    deploymentId?: string | null;
    eventId?: string | null;
    upsertCrmLead?: boolean;
  }): Promise<{
    workspaceUserId: string | null;
    memberId: string | null;
    userName: string;
    userEmail: string;
    userPhone: string;
    matchedUserBy: 'userId' | 'phone' | 'email' | null;
  }> {
    const guestName = input.guestName?.trim() ?? '';
    const guestEmail = input.guestEmail?.trim().toLowerCase() ?? '';
    const guestPhone = input.guestPhone?.trim() ?? '';
    const explicitUserId = input.workspaceUserId?.trim() ?? '';

    let matchedUserBy: 'userId' | 'phone' | 'email' | null = null;
    let workspaceUser: WorkspaceUserContact | null = null;

    if (explicitUserId) {
      workspaceUser = await this.getWorkspaceUserContact(explicitUserId);
      if (workspaceUser) matchedUserBy = 'userId';
    }

    if (!workspaceUser && (guestPhone || guestEmail)) {
      const match = await this.resolveWorkspaceUserByContact({
        phone: guestPhone,
        email: guestEmail,
      });
      if (match) {
        workspaceUser = match.user;
        matchedUserBy = match.matchedBy;
      }
    }

    const userName =
      workspaceUser?.name ||
      guestName ||
      (guestEmail ? guestEmail.split('@')[0] : '') ||
      'Respondent';
    const userEmail = workspaceUser?.email || guestEmail;
    const userPhone = workspaceUser?.phone || guestPhone;

    let memberId: string | null = null;
    if (input.upsertCrmLead !== false && input.formTitle?.trim()) {
      const lead = await this.upsertFormRespondentLead({
        fullName: userName,
        email: userEmail,
        phone: userPhone,
        formTitle: input.formTitle.trim(),
        deploymentId: input.deploymentId ?? null,
        eventId: input.eventId ?? null,
        workspaceUserId: workspaceUser?.userId ?? (explicitUserId || null),
      });
      memberId = lead.memberInternalId;
    } else if (workspaceUser) {
      memberId = await this.findMemberIdByUserId(workspaceUser.userId);
      if (!memberId) {
        const linked = await this.resolveMemberIdByContact({
          phone: userPhone,
          email: userEmail,
        });
        memberId = linked?.id ?? null;
      }
    }

    return {
      workspaceUserId: workspaceUser?.userId ?? (explicitUserId || null),
      memberId,
      userName,
      userEmail,
      userPhone,
      matchedUserBy,
    };
  }

  /** Resolve workspace User contact only (no CRM side effects). */
  async resolveFormRespondentContact(input: {
    workspaceUserId?: string | null;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    upsertCrmLead?: boolean;
    formTitle?: string;
    deploymentId?: string | null;
    eventId?: string | null;
  }): Promise<{
    workspaceUserId: string | null;
    memberId: string | null;
    userName: string;
    userEmail: string;
    userPhone: string;
    matchedUserBy: 'userId' | 'phone' | 'email' | null;
  }> {
    return this.resolveFormRespondentContext(input);
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
   * Mirror Account Settings (`User` profile) into linked CRM `members`.
   * User is source of truth for name, email, and phone.
   */
  async syncFromWorkspaceUserProfile(input: {
    userId: string;
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
      const userId = input.userId.trim();
      const lookupEmail = input.lookupEmail.trim().toLowerCase();
      const email = input.email.trim().toLowerCase();
      if (!email.includes('@') || !userId) return;

      const phone = input.phone.trim();
      const name = input.fullName.trim().slice(0, 255);
      const jobTitle = input.jobTitle.trim().slice(0, 255);
      const company = input.company.trim().slice(0, 255);
      const domicile = input.domicile.trim().slice(0, 255);
      const instagram = input.instagram?.trim().slice(0, 120) || null;
      const linkedinUrl = input.linkedinUrl?.trim().slice(0, 500) || null;

      let memberId = await this.findMemberIdByUserId(userId);
      if (!memberId) {
        const linked = await this.resolveMemberIdByContact({
          phone,
          email: lookupEmail || email,
        });
        memberId = linked?.id ?? null;
      }

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
        await this.linkMemberToWorkspaceUser(memberId, userId);
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
      const created = await this.create(dto);
      const createdInternalId =
        (await this.findMemberIdByEmail(email)) ??
        (await this.findMemberIdByUserId(userId));
      if (createdInternalId) {
        await this.linkMemberToWorkspaceUser(createdInternalId, userId);
      } else {
        void created;
      }
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
    workspaceUserId?: string | null,
  ): Promise<string | null> {
    const email = rawEmail?.trim().toLowerCase();
    if (!email?.includes('@')) return null;

    const linkedUserId = workspaceUserId?.trim() || '';
    if (linkedUserId) {
      const byUser = await this.findMemberIdByUserId(linkedUserId);
      if (byUser) return byUser;
    }

    const existing = await this.findMemberIdByEmail(email);
    if (existing) {
      if (linkedUserId) {
        await this.linkMemberToWorkspaceUser(existing, linkedUserId);
      }
      return existing;
    }
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
      const memberId = await this.findMemberIdByEmail(email);
      if (memberId && linkedUserId) {
        await this.linkMemberToWorkspaceUser(memberId, linkedUserId);
      }
      this.logger.log(`CRM member provisioned for purchase email ${email}`);
      return memberId;
    } catch (e) {
      if (e instanceof ConflictException) {
        const memberId = await this.findMemberIdByEmail(email);
        if (memberId && linkedUserId) {
          await this.linkMemberToWorkspaceUser(memberId, linkedUserId);
        }
        return memberId;
      }
      this.logger.warn(
        `ensureCrmMemberForPurchaseEmail(${email}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
  }

  async ensureCrmMemberForWorkspaceEmail(
    rawEmail: string,
    options?: {
      displayName?: string | null;
      program?: string;
      platform?: string;
      workspaceUserId?: string | null;
    },
  ): Promise<string | null> {
    const email = rawEmail?.trim().toLowerCase();
    if (!email?.includes('@')) return null;

    const linkedUserId = options?.workspaceUserId?.trim() || '';
    if (linkedUserId) {
      const byUser = await this.findMemberIdByUserId(linkedUserId);
      if (byUser) return byUser;
    }

    const existing = await this.findMemberIdByEmail(email);
    if (existing) {
      if (linkedUserId) {
        await this.linkMemberToWorkspaceUser(existing, linkedUserId);
      }
      return existing;
    }
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
      const memberId = await this.findMemberIdByEmail(email);
      if (memberId && linkedUserId) {
        await this.linkMemberToWorkspaceUser(memberId, linkedUserId);
      }
      this.logger.log(`CRM member provisioned for workspace email ${email}`);
      return memberId;
    } catch (e) {
      if (e instanceof ConflictException) {
        const memberId = await this.findMemberIdByEmail(email);
        if (memberId && linkedUserId) {
          await this.linkMemberToWorkspaceUser(memberId, linkedUserId);
        }
        return memberId;
      }
      this.logger.warn(
        `ensureCrmMemberForWorkspaceEmail(${email}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
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

  /**
   * Guest/authenticated form respondent: upsert CRM row for sales pipeline.
   * Workspace User is resolved first; member match is by user_id then phone/email.
   */
  async upsertFormRespondentLead(input: {
    fullName: string;
    email: string;
    phone: string;
    formTitle: string;
    deploymentId?: string | null;
    eventId?: string | null;
    workspaceUserId?: string | null;
  }): Promise<{
    created: boolean;
    member: Member;
    matchedBy: 'phone' | 'email' | null;
    memberInternalId: string;
  }> {
    const phone = input.phone.trim();
    const email = input.email.trim().toLowerCase();
    const name = input.fullName.trim().slice(0, 255);
    const formTag = `Form: ${input.formTitle.trim().slice(0, 120)}`;
    const deploymentTag = input.deploymentId?.trim()
      ? `FormDeployment: ${input.deploymentId.trim().slice(0, 80)}`
      : null;
    const eventTag = input.eventId?.trim()
      ? `FormEvent: ${input.eventId.trim().slice(0, 80)}`
      : null;
    const extraTags = [formTag, deploymentTag, eventTag].filter(
      (t): t is string => !!t,
    );

    let workspaceUser: WorkspaceUserContact | null = null;
    const explicitUserId = input.workspaceUserId?.trim() ?? '';
    if (explicitUserId) {
      workspaceUser = await this.getWorkspaceUserContact(explicitUserId);
    }
    if (!workspaceUser) {
      const workspaceMatch = await this.resolveWorkspaceUserByContact({
        phone,
        email,
      });
      workspaceUser = workspaceMatch?.user ?? null;
    }

    const canonicalName = workspaceUser?.name || name;
    const canonicalEmail = workspaceUser?.email || email;
    const canonicalPhone = workspaceUser?.phone || phone;

    let memberId: string | null = null;
    let matchedBy: 'phone' | 'email' | null = null;

    if (workspaceUser) {
      memberId = await this.findMemberIdByUserId(workspaceUser.userId);
    }
    if (!memberId) {
      const resolved = await this.resolveMemberIdByContact({
        phone: canonicalPhone || phone,
        email: canonicalEmail || email,
      });
      memberId = resolved?.id ?? null;
      matchedBy = resolved?.matchedBy ?? null;
      if (memberId && workspaceUser) {
        await this.safeLinkMemberToWorkspaceUser(memberId, workspaceUser.userId);
      }
    }

    if (memberId) {
      const existing = await this.findOne(memberId);
      const mergedTags = Array.from(
        new Set([...(existing.tags ?? []), ...extraTags]),
      );
      const lifecycleRank = this.lifecycleRank(existing.lifecycleStage);
      const identifiedRank = this.lifecycleRank('IDENTIFIED');
      const nextLifecycle =
        lifecycleRank >= identifiedRank ? existing.lifecycleStage : 'IDENTIFIED';

      const basePatch = {
        tags: mergedTags,
        platform: existing.platform?.trim() || 'Form',
        program: existing.program?.trim() || `Form: ${input.formTitle.trim()}`,
        lifecycleStage: nextLifecycle,
      };

      const withContact = workspaceUser
        ? {
            name: canonicalName,
            email: canonicalEmail,
            phone: canonicalPhone || existing.phone,
            ...basePatch,
          }
        : {
            ...(!existing.phone?.trim() && phone ? { phone } : {}),
            ...(!existing.email?.trim() && email ? { email } : {}),
            ...basePatch,
          };

      const updated = await this.safeUpdateFormLeadMember(
        memberId,
        withContact,
        workspaceUser
          ? {
              name: canonicalName,
              phone: canonicalPhone || existing.phone,
              ...basePatch,
            }
          : null,
      );
      return {
        created: false,
        member: updated,
        matchedBy,
        memberInternalId: memberId,
      };
    }

    const normalizedPhone = normalizePhone(canonicalPhone || phone);
    const createEmail =
      canonicalEmail ||
      email ||
      (normalizedPhone ? `${normalizedPhone}@forms.lead` : '');

    const memberDto = CreateMemberDtoSchema.parse({
      name:
        canonicalName ||
        createEmail.split('@')[0] ||
        'Form Respondent',
      email: createEmail,
      phone: canonicalPhone || phone,
      category: 'Guest',
      scholarship: false,
      joinMonth: new Date().toISOString().slice(0, 7),
      program: `Form: ${input.formTitle.trim()}`,
      mentorshipDuration: 0,
      nTagStatus: 'Not yet',
      platform: 'Form',
      regInUS: false,
      lifecycleStage: 'IDENTIFIED',
      tags: ['Form_Lead', ...extraTags],
      engagement: {
        lastActiveDate: new Date().toISOString(),
        eventsAttendedCount: 0,
        contentCompletionRate: 0,
        communityReputationScore: 0,
        leadScore: 15,
      },
    });

    let member: Member;
    try {
      member = await this.create(memberDto);
    } catch (err) {
      if (err instanceof ConflictException) {
        const existingId =
          (await this.findMemberIdByEmail(createEmail)) ??
          (await this.findMemberIdByPhone(canonicalPhone || phone));
        if (existingId) {
          const existing = await this.findOne(existingId);
          const mergedTags = Array.from(
            new Set([...(existing.tags ?? []), 'Form_Lead', ...extraTags]),
          );
          member = await this.safeUpdateFormLeadMember(
            existingId,
            {
              name: canonicalName || existing.name,
              phone: canonicalPhone || existing.phone || phone,
              tags: mergedTags,
              platform: existing.platform?.trim() || 'Form',
              program: existing.program?.trim() || `Form: ${input.formTitle.trim()}`,
              lifecycleStage:
                this.lifecycleRank(existing.lifecycleStage) >=
                this.lifecycleRank('IDENTIFIED')
                  ? existing.lifecycleStage
                  : 'IDENTIFIED',
            },
            workspaceUser
              ? {
                  name: canonicalName,
                  phone: canonicalPhone || existing.phone || phone,
                  tags: mergedTags,
                  platform: existing.platform?.trim() || 'Form',
                  program:
                    existing.program?.trim() || `Form: ${input.formTitle.trim()}`,
                  lifecycleStage:
                    this.lifecycleRank(existing.lifecycleStage) >=
                    this.lifecycleRank('IDENTIFIED')
                      ? existing.lifecycleStage
                      : 'IDENTIFIED',
                }
              : null,
          );
          if (workspaceUser) {
            await this.safeLinkMemberToWorkspaceUser(
              existingId,
              workspaceUser.userId,
            );
          }
          return {
            created: false,
            member,
            matchedBy: 'email',
            memberInternalId: existingId,
          };
        }
      }
      throw err;
    }

    const memberInternalId =
      (await this.findMemberIdByEmail(createEmail)) ??
      (await this.findMemberIdByPhone(canonicalPhone || phone));
    if (!memberInternalId) {
      throw new BadRequestException(
        'Failed to resolve CRM member after form lead creation',
      );
    }
    if (workspaceUser) {
      await this.safeLinkMemberToWorkspaceUser(
        memberInternalId,
        workspaceUser.userId,
      );
    }
    return { created: true, member, matchedBy: null, memberInternalId };
  }

  private async safeLinkMemberToWorkspaceUser(
    memberInternalId: string,
    workspaceUserId: string,
  ): Promise<void> {
    try {
      await this.linkMemberToWorkspaceUser(memberInternalId, workspaceUserId);
    } catch (err) {
      this.logger.warn(
        `linkMemberToWorkspaceUser(${memberInternalId}, ${workspaceUserId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async safeUpdateFormLeadMember(
    memberId: string,
    patch: UpdateMemberDto,
    fallbackWithoutEmail: UpdateMemberDto | null,
  ): Promise<Member> {
    try {
      return await this.update(memberId, patch);
    } catch (err) {
      if (err instanceof ConflictException && fallbackWithoutEmail) {
        return await this.update(memberId, fallbackWithoutEmail);
      }
      throw err;
    }
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
        $26,
        $27,
        $28::jsonb,
        $29::text[],
        $30::jsonb,
        $31,
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
        m.user_id as "userId",
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

  /**
   * Unified audit trail: CRM activity logs + paid conversion events (SIGNED_IN / PAID).
   */
  async getMemberJourney(identifier: string): Promise<
    Array<{
      id: string;
      date: string;
      userId: string;
      category:
        | 'ACQUISITION'
        | 'ENGAGEMENT'
        | 'COMMERCE'
        | 'MARKETING'
        | 'SYSTEM'
        | 'MENTORING';
      title: string;
      description: string;
      metadata?: Record<string, unknown>;
    }>
  > {
    const row = await this.findRowByIdentifier(identifier);
    const publicId = row.id;
    const email = row.email?.trim().toLowerCase() || '';

    const events: Array<{
      id: string;
      date: string;
      userId: string;
      category:
        | 'ACQUISITION'
        | 'ENGAGEMENT'
        | 'COMMERCE'
        | 'MARKETING'
        | 'SYSTEM'
        | 'MENTORING';
      title: string;
      description: string;
      metadata?: Record<string, unknown>;
    }> = [];

    if (row.createdAt) {
      const createdIso = new Date(row.createdAt).toISOString();
      events.push({
        id: `profile-${row.internalId}`,
        date: createdIso,
        userId: publicId,
        category: 'ACQUISITION',
        title: 'Profile Created',
        description: `Joined CRM as ${row.lifecycleStage}.`,
        metadata: {
          lifecycleStage: row.lifecycleStage,
          program: row.program ?? null,
        },
      });
    }

    const logsRes = await this.db.query<{
      id: string;
      date: string;
      category: string;
      action: string;
      details: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `
      select
        id::text as id,
        date::text as date,
        category,
        action,
        details,
        metadata
      from member_activity_logs
      where "memberId" = $1 or "memberId" = $2
      order by date desc, "createdAt" desc
      `,
      [publicId, row.internalId],
    );

    for (const log of logsRes.rows) {
      events.push({
        id: `log-${log.id}`,
        date: this.toJourneyIsoDate(log.date),
        userId: publicId,
        category: this.normalizeJourneyCategory(log.category),
        title: log.action,
        description: log.details?.trim() || log.action,
        metadata: log.metadata ?? undefined,
      });
    }

    const conversionRes = await this.db.query<{
      id: string;
      eventType: string;
      campaignName: string | null;
      campaignSourceCode: string | null;
      productsSummary: string | null;
      totalAmount: number;
      orderId: string | null;
      picNameSnapshot: string | null;
      paidAt: string;
    }>(
      `
      select
        pcr.id::text as id,
        pcr.event_type as "eventType",
        pcr.campaign_name as "campaignName",
        pcr.campaign_source_code as "campaignSourceCode",
        pcr.products_summary as "productsSummary",
        pcr."totalAmount"::float8 as "totalAmount",
        pcr."orderId" as "orderId",
        pcr.pic_name_snapshot as "picNameSnapshot",
        coalesce(pcr.paid_at, pcr."createdAt")::text as "paidAt"
      from paid_conversion_records pcr
      where (
        ($1::uuid is not null and pcr.buyer_member_id = $1::uuid)
        or ($2 <> '' and lower(trim(pcr.buyer_email)) = lower($2))
      )
      order by coalesce(pcr.paid_at, pcr."createdAt") desc
      `,
      [row.internalId, email],
    );

    for (const conv of conversionRes.rows) {
      const eventType = String(conv.eventType ?? '').toUpperCase();
      const occurredAt = conv.paidAt || new Date().toISOString();
      if (eventType === 'SIGNED_IN') {
        const campaignLabel =
          conv.campaignName?.trim() ||
          conv.campaignSourceCode?.trim() ||
          'Campaign';
        events.push({
          id: `pcr-${conv.id}`,
          date: occurredAt,
          userId: publicId,
          category: 'MARKETING',
          title: 'Campaign Sign-In',
          description: `Signed in via ${campaignLabel}.`,
          metadata: {
            campaignSourceCode: conv.campaignSourceCode,
            campaignName: conv.campaignName,
            orderId: conv.orderId,
          },
        });
        continue;
      }

      if (eventType === 'PAID') {
        const productLabel = conv.productsSummary?.trim() || 'Membership package';
        events.push({
          id: `pcr-${conv.id}`,
          date: occurredAt,
          userId: publicId,
          category: 'COMMERCE',
          title: 'Payment Received',
          description: `${productLabel}${conv.orderId ? ` (${conv.orderId})` : ''}.`,
          metadata: {
            revenue: Number(conv.totalAmount) || 0,
            orderId: conv.orderId,
            picName: conv.picNameSnapshot,
            productsSummary: conv.productsSummary,
          },
        });
      }
    }

    events.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return events;
  }

  private toJourneyIsoDate(raw: string): string {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return new Date().toISOString();
  }

  private normalizeJourneyCategory(raw: string):
    | 'ACQUISITION'
    | 'ENGAGEMENT'
    | 'COMMERCE'
    | 'MARKETING'
    | 'SYSTEM'
    | 'MENTORING' {
    const normalized = String(raw ?? '')
      .trim()
      .toUpperCase();
    switch (normalized) {
      case 'ACQUISITION':
      case 'ENGAGEMENT':
      case 'COMMERCE':
      case 'MARKETING':
      case 'SYSTEM':
      case 'MENTORING':
        return normalized;
      default:
        return 'SYSTEM';
    }
  }

  async findOneByWorkspaceUserId(workspaceUserId: string): Promise<Member | null> {
    const userId = workspaceUserId.trim();
    if (!userId) return null;
    const memberId = await this.findMemberIdByUserId(userId);
    if (!memberId) return null;
    return this.findOne(memberId);
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
    let manualFacilitatorLinkageKey: string | null | undefined;

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
        manualFacilitatorLinkageKey = facilitator.id;
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
    if (
      !preserveExplicitFacilitatorType &&
      manualFacilitatorLinkageKey &&
      dto.nTagStatus === undefined
    ) {
      params.push(manualFacilitatorLinkageKey);
      fields.push(`"nTagStatus" = $${params.length}`);
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
        m.user_id as "userId",
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
        and coalesce(s."eventName", '') <> $3
      order by s."createdAt" desc
      `,
      [userId, email, TRIBE_MEMBER_NOTE_EVENT],
    );
    return result.rows;
  }

  async getTribeMemberNotes(
    facilitatorUserId: string,
    facilitatorEmail?: string | null,
  ): Promise<TribeMemberNoteRow[]> {
    const userId = facilitatorUserId?.trim() ?? '';
    const email = facilitatorEmail?.trim().toLowerCase() ?? '';
    if (!userId && !email) return [];

    const result = await this.db.query<TribeMemberNoteRow>(
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
      ),
      ranked_notes as (
        select
          s.id::text as id,
          coalesce(s."memberId", '') as "memberId",
          coalesce(s."memberName", '') as "memberName",
          coalesce(s.notes, '') as notes,
          s."createdAt",
          row_number() over (
            partition by coalesce(s."memberId", '')
            order by s."createdAt" desc, s.id desc
          ) as rn
        from tribe_mentoring_sessions s
        where s."facilitatorId" in (select key from facilitator_keys)
          and coalesce(s."eventName", '') = $3
          and coalesce(s."memberId", '') <> ''
      )
      select id, "memberId", "memberName", notes, "createdAt"
      from ranked_notes
      where rn = 1
      order by "createdAt" desc
      `,
      [userId, email, TRIBE_MEMBER_NOTE_EVENT],
    );
    return result.rows;
  }

  async upsertTribeMemberNote(params: {
    facilitatorUserId: string;
    facilitatorEmail?: string | null;
    memberId: string;
    note: string;
  }): Promise<TribeMemberNoteRow> {
    const facilitatorId = params.facilitatorUserId?.trim() ?? '';
    const facilitatorEmail = params.facilitatorEmail?.trim().toLowerCase() ?? '';
    const memberId = params.memberId?.trim() ?? '';
    const note = String(params.note ?? '').trim();

    if (!facilitatorId && !facilitatorEmail) {
      throw new BadRequestException('Facilitator context is required');
    }
    if (!memberId) {
      throw new BadRequestException('memberId is required');
    }
    if (!note) {
      throw new BadRequestException('Note is required');
    }
    if (note.length > 2000) {
      throw new BadRequestException('Note is too long (max 2000 characters)');
    }

    const member = await this.resolveOwnedTribeMember(
      facilitatorId,
      facilitatorEmail,
      memberId,
    );
    const facilitator = await this.prisma.user.findUnique({
      where: { id: facilitatorId },
      select: { name: true, email: true },
    });
    const facilitatorName =
      facilitator?.name?.trim() ||
      facilitator?.email?.trim() ||
      facilitatorEmail ||
      facilitatorId;

    const existing = await this.db.query<{ id: string }>(
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
      select s.id::text as id
      from tribe_mentoring_sessions s
      where s."facilitatorId" in (select key from facilitator_keys)
        and coalesce(s."eventName", '') = $3
        and coalesce(s."memberId", '') = $4
      order by s."createdAt" desc, s.id desc
      limit 1
      `,
      [facilitatorId, facilitatorEmail, TRIBE_MEMBER_NOTE_EVENT, member.memberId],
    );

    if (existing.rows[0]?.id) {
      const updated = await this.db.query<TribeMemberNoteRow>(
        `
        update tribe_mentoring_sessions
        set
          "facilitatorId" = $2,
          "facilitatorName" = $3,
          "memberId" = $4,
          "memberName" = $5,
          notes = $6
        where id::text = $1
        returning
          id::text as id,
          coalesce("memberId", '') as "memberId",
          coalesce("memberName", '') as "memberName",
          coalesce(notes, '') as notes,
          "createdAt"
        `,
        [
          existing.rows[0].id,
          facilitatorId,
          facilitatorName,
          member.memberId,
          member.memberName,
          note,
        ],
      );
      return updated.rows[0];
    }

    const inserted = await this.db.query<TribeMemberNoteRow>(
      `
      insert into tribe_mentoring_sessions (
        "facilitatorId",
        "facilitatorName",
        "eventName",
        "memberId",
        "memberName",
        notes
      )
      values ($1, $2, $3, $4, $5, $6)
      returning
        id::text as id,
        coalesce("memberId", '') as "memberId",
        coalesce("memberName", '') as "memberName",
        coalesce(notes, '') as notes,
        "createdAt"
      `,
      [
        facilitatorId,
        facilitatorName,
        TRIBE_MEMBER_NOTE_EVENT,
        member.memberId,
        member.memberName,
        note,
      ],
    );
    return inserted.rows[0];
  }

  async deleteTribeMemberNote(params: {
    facilitatorUserId: string;
    facilitatorEmail?: string | null;
    memberId: string;
  }): Promise<{ ok: true }> {
    const facilitatorId = params.facilitatorUserId?.trim() ?? '';
    const facilitatorEmail = params.facilitatorEmail?.trim().toLowerCase() ?? '';
    const memberId = params.memberId?.trim() ?? '';

    if (!facilitatorId && !facilitatorEmail) {
      throw new BadRequestException('Facilitator context is required');
    }
    if (!memberId) {
      throw new BadRequestException('memberId is required');
    }

    await this.resolveOwnedTribeMember(facilitatorId, facilitatorEmail, memberId);

    await this.db.query(
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
      delete from tribe_mentoring_sessions s
      where s."facilitatorId" in (select key from facilitator_keys)
        and coalesce(s."eventName", '') = $3
        and coalesce(s."memberId", '') = $4
      `,
      [facilitatorId, facilitatorEmail, TRIBE_MEMBER_NOTE_EVENT, memberId],
    );

    return { ok: true };
  }

  private async resolveOwnedTribeMember(
    facilitatorUserId: string,
    facilitatorEmail: string,
    rawMemberId: string,
  ): Promise<{ memberId: string; memberName: string }> {
    const memberId = rawMemberId.trim();
    const result = await this.db.query<{ memberId: string; memberName: string }>(
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
        trim(m.name) as "memberName"
      from members m
      where coalesce(nullif(trim(m.public_id), ''), m.id::text) = $3
        and coalesce(m."nTagStatus", '') in (select key from facilitator_keys)
      limit 1
      `,
      [facilitatorUserId, facilitatorEmail, memberId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Tribe member not found');
    }
    return row;
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
      userId: row.userId?.trim() || undefined,
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

export interface TribeMemberNoteRow {
  id: string;
  memberId: string;
  memberName: string;
  notes: string;
  createdAt: string | Date;
}
