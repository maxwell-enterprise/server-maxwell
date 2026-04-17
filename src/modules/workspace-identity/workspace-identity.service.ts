import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccountDeletionRequestDelegate } from '../../prisma/prisma-account-deletion.types';
import { AccountDeletionBroadcastService } from './account-deletion-broadcast.service';
import {
  USER_ROLE,
  UserRoleString,
  assertAssignableRole,
  parseAppRoleString,
} from './user-role.constants';

function getBootstrapAdminEmails(): Set<string> {
  const raw = process.env.APP_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(/[,;\n\r]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isBootstrapAdminEmail(email: string): boolean {
  return getBootstrapAdminEmails().has(email.trim().toLowerCase());
}

@Injectable()
export class WorkspaceIdentityService {
  private readonly logger = new Logger(WorkspaceIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountDeletionBroadcast: AccountDeletionBroadcastService,
  ) {}

  private get accountDeletionRequestDelegate(): AccountDeletionRequestDelegate {
    return (
      this.prisma as unknown as {
        accountDeletionRequest: AccountDeletionRequestDelegate;
      }
    ).accountDeletionRequest;
  }

  /** Prisma P2021: table not migrated (e.g. `028_account_deletion_requests.sql` not applied). */
  private isAccountDeletionTableMissing(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2021'
    );
  }

  private getFrontendBaseUrl(): string {
    return (
      process.env.EMAIL_PUBLIC_BASE_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  private async sendWorkspaceEmail(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() ?? 'onboarding@resend.dev';
    if (!resendKey) {
      this.logger.warn(
        `Skip workspace email (${params.subject}) to ${params.to}: RESEND_API_KEY missing`,
      );
      return;
    }
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      this.logger.warn(
        `Workspace email failed (${params.subject}) to ${params.to}: ${error.message}`,
      );
    }
  }

  private isInvitableInternalRole(role: UserRoleString): boolean {
    // Security Admin: core business roles + Super Admin + Member (revoke).
    // No Guest / Gate Keeper / Facilitator via this endpoint.
    const allowed = new Set<UserRoleString>([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.FINANCE,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.SALES,
      USER_ROLE.MEMBER,
    ]);
    return allowed.has(role);
  }

  async ensureBootstrapSuperAdmin(
    userId: string,
    email: string | null | undefined,
  ): Promise<void> {
    const e = email?.trim().toLowerCase();
    if (!e || !isBootstrapAdminEmail(e)) return;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appRole: true },
    });
    if (!row) return;

    const r = row.appRole.trim();
    if (r === USER_ROLE.MEMBER || r === USER_ROLE.GUEST) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { appRole: USER_ROLE.SUPER_ADMIN },
      });
    }
  }

  async applyPendingRoleInvites(userId: string, email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const now = new Date();

    const pending = await this.prisma.pendingRoleInvite.findFirst({
      where: {
        email: normalized,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) return;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { appRole: pending.targetRole },
      }),
      this.prisma.pendingRoleInvite.update({
        where: { id: pending.id },
        data: { consumedAt: now },
      }),
    ]);

    await this.createRoleChangeInbox(userId, pending.targetRole);

    // Keep Super Admin as a single active holder for handover flows:
    // when an invited Super Admin role is consumed by target user, inviter
    // is auto-downgraded to Sales (applies after inviter refreshes session).
    if (
      pending.targetRole === USER_ROLE.SUPER_ADMIN &&
      pending.createdByUserId &&
      pending.createdByUserId !== userId
    ) {
      const downgraded = await this.prisma.user.updateMany({
        where: {
          id: pending.createdByUserId,
          appRole: USER_ROLE.SUPER_ADMIN,
        },
        data: { appRole: USER_ROLE.SALES },
      });
      if (downgraded.count > 0) {
        await this.createRoleChangeInbox(
          pending.createdByUserId,
          USER_ROLE.SALES,
        );
        await this.appendSecurityAudit(
          pending.createdByUserId,
          'RBAC_SUPER_ADMIN_HANDOVER_ACTOR_DOWNGRADED',
          {
            inviteId: pending.id,
            targetUserId: userId,
            targetRole: pending.targetRole,
            actorNewRole: USER_ROLE.SALES,
          },
        );
      }
    }
  }

  async createRoleChangeInbox(
    userId: string,
    newRoleDisplay: string,
  ): Promise<void> {
    await this.prisma.inboxNotification.create({
      data: {
        userId,
        type: 'ROLE_CHANGED',
        title: 'Workspace role updated',
        body: `Your access role is now "${newRoleDisplay}" (RBAC). Please log out and sign in again so menus and actions refresh to the latest permissions.`,
        payload: { newRole: newRoleDisplay },
      },
    });
  }

  async postRoleInvite(params: {
    actorUserId: string;
    actorRole: string;
    email: string;
    targetRole: string;
  }): Promise<
    | {
        ok: true;
        mode: 'updated';
        userId: string;
        actorRelogRequired?: boolean;
        actorNewRole?: string;
      }
    | { ok: true; mode: 'pending_signup'; inviteId: string }
  > {
    if (parseAppRoleString(params.actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }

    const rawEmail = params.email.trim().toLowerCase();
    if (!rawEmail.includes('@')) {
      throw new BadRequestException('Invalid email');
    }

    const targetRole = assertAssignableRole(params.targetRole);
    if (!this.isInvitableInternalRole(targetRole)) {
      throw new BadRequestException(
        'Target role is not invitable via Security Admin',
      );
    }
    const shouldAutoDowngradeActorAfterSuperAdminHandover =
      targetRole === USER_ROLE.SUPER_ADMIN;

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: rawEmail, mode: 'insensitive' } },
      select: { id: true, appRole: true },
    });

    // Legacy column is still required by schema; use far-future marker.
    const expiresAt = new Date('9999-12-31T23:59:59.999Z');

    if (existing) {
      const existingRole = parseAppRoleString(existing.appRole);
      const isDemotingLastSuperAdmin =
        existingRole === USER_ROLE.SUPER_ADMIN &&
        targetRole !== USER_ROLE.SUPER_ADMIN;
      if (isDemotingLastSuperAdmin) {
        const superAdminCount = await this.prisma.user.count({
          where: { appRole: USER_ROLE.SUPER_ADMIN },
        });
        if (superAdminCount <= 1) {
          throw new BadRequestException(
            'At least one Super Admin must remain active',
          );
        }
      }

      await this.prisma.user.update({
        where: { id: existing.id },
        data: { appRole: targetRole },
      });
      await this.createRoleChangeInbox(existing.id, targetRole);
      await this.sendWorkspaceEmail({
        to: rawEmail,
        subject: `Workspace role updated: ${targetRole}`,
        html: `<p>Your workspace role has been updated to <strong>${targetRole}</strong>.</p><p>Please log out and sign in again to apply the latest permissions.</p><p><a href="${this.getFrontendBaseUrl()}">Open workspace</a></p>`,
      });
      await this.appendSecurityAudit(params.actorUserId, 'RBAC_ROLE_UPDATED', {
        targetEmail: rawEmail,
        targetUserId: existing.id,
        targetRole,
      });

      // Super Admin handover policy:
      // when actor grants Super Admin to another existing account, actor is
      // automatically downgraded to Sales (effective after next login token refresh).
      if (
        shouldAutoDowngradeActorAfterSuperAdminHandover &&
        existing.id !== params.actorUserId
      ) {
        await this.prisma.user.update({
          where: { id: params.actorUserId },
          data: { appRole: USER_ROLE.SALES },
        });
        await this.createRoleChangeInbox(params.actorUserId, USER_ROLE.SALES);
        await this.appendSecurityAudit(
          params.actorUserId,
          'RBAC_SUPER_ADMIN_HANDOVER_ACTOR_DOWNGRADED',
          {
            targetEmail: rawEmail,
            targetUserId: existing.id,
            targetRole,
            actorNewRole: USER_ROLE.SALES,
          },
        );
      }
      const actorRelogRequired =
        shouldAutoDowngradeActorAfterSuperAdminHandover &&
        existing.id !== params.actorUserId;
      return {
        ok: true,
        mode: 'updated',
        userId: existing.id,
        actorRelogRequired,
        actorNewRole: actorRelogRequired ? USER_ROLE.SALES : undefined,
      };
    }

    await this.prisma.pendingRoleInvite.deleteMany({
      where: { email: rawEmail, consumedAt: null },
    });

    const invite = await this.prisma.pendingRoleInvite.create({
      data: {
        email: rawEmail,
        targetRole,
        createdByUserId: params.actorUserId,
        expiresAt,
      },
    });

    await this.sendWorkspaceEmail({
      to: rawEmail,
      subject: `You're invited to ${targetRole} workspace access`,
      html: `<p>Your email has been invited to the role <strong>${targetRole}</strong>.</p><p>Sign in with this same email at <a href="${this.getFrontendBaseUrl()}">${this.getFrontendBaseUrl()}</a>. This invitation remains active until it is used or replaced by a newer invite.</p><p>After sign-in, your role will be applied automatically and you may be asked to re-login once.</p>`,
    });

    await this.appendSecurityAudit(params.actorUserId, 'RBAC_ROLE_INVITED', {
      targetEmail: rawEmail,
      targetRole,
      inviteId: invite.id,
    });

    return { ok: true, mode: 'pending_signup', inviteId: invite.id };
  }

  async patchUserAbac(params: {
    actorUserId: string;
    actorRole: string;
    email: string;
    abacContext: Prisma.InputJsonValue | undefined;
  }): Promise<void> {
    if (parseAppRoleString(params.actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }

    const email = params.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { abacContext: params.abacContext ?? undefined },
    });
    await this.appendSecurityAudit(params.actorUserId, 'ABAC_CONTEXT_UPDATED', {
      targetEmail: email,
      targetUserId: user.id,
    });
  }

  private async appendSecurityAudit(
    actorUserId: string,
    action: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO system_security_logs (id, "userId", action, context)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb)`,
      actorUserId,
      action,
      JSON.stringify(context),
    );
  }

  /**
   * Security → User Access: tugasnya mengangkat orang ke role workspace (Promote + ubah role).
   * Response **tidak** menyertakan Member — hanya yang sudah/akan dikelola sebagai staff (Guest+).
   * Filter pakai `parseAppRoleString` (bukan SQL `IN` ketat) supaya nilai `appRole` di DB tetap ketangkap
   * walau ada beda tipis; Member apa pun bentuk string-nya (setelah parse) tetap di-drop.
   */
  async listInternalUsers(actorRole: string) {
    const r = parseAppRoleString(actorRole);
    const canList = new Set<string>([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.FINANCE,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.SALES,
      USER_ROLE.GATE_KEEPER,
      USER_ROLE.FACILITATOR,
      USER_ROLE.GUEST,
    ]);
    if (!canList.has(r)) {
      throw new ForbiddenException();
    }

    const rows = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        appRole: true,
      },
      orderBy: { email: 'asc' },
    });

    const list = rows
      .map((row) => ({
        id: row.id,
        email: row.email ?? '',
        fullName: row.name ?? row.email?.split('@')[0] ?? 'Unknown User',
        role: parseAppRoleString(row.appRole ?? ''),
        avatarUrl: row.image,
        provider: 'email' as const,
      }))
      .filter((u) => u.role !== USER_ROLE.MEMBER);

    list.sort((a, b) => {
      const aSuper = a.role === USER_ROLE.SUPER_ADMIN ? 0 : 1;
      const bSuper = b.role === USER_ROLE.SUPER_ADMIN ? 0 : 1;
      if (aSuper !== bSuper) return aSuper - bSuper;
      return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
    });

    return list;
  }

  async getRbacTasksForUser(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appRole: true },
    });
    const assignedRole = parseAppRoleString(row?.appRole);

    const rows = await this.prisma.inboxNotification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });

    return rows.map((n) => ({
      id: `inbox-${n.id}`,
      title: n.title,
      description: n.body,
      source: 'SYSTEM',
      status: 'UNREAD',
      priority: 'HIGH',
      createdAt: n.createdAt.toISOString(),
      assignedRole,
      metadata: {
        rbacInboxId: n.id,
        memberName: 'RBAC',
      },
    }));
  }

  async markInboxRead(userId: string, inboxId: string): Promise<boolean> {
    const result = await this.prisma.inboxNotification.updateMany({
      where: { id: inboxId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  // --- Voucher persistence (per-user; stored in User.abacContext) ---

  async getActiveVoucherForUser(userId: string): Promise<{
    code: string;
    productId?: string;
    claimedAt: string;
  } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { abacContext: true },
    });
    const ctx = (row?.abacContext ?? null) as any;
    const v = ctx?.commerceVoucher;
    if (!v || typeof v !== 'object') return null;
    if (v.status && String(v.status).toUpperCase() !== 'ACTIVE') return null;
    const code = typeof v.code === 'string' ? v.code.trim() : '';
    if (!code) return null;
    return {
      code,
      productId: typeof v.productId === 'string' ? v.productId : undefined,
      claimedAt:
        typeof v.claimedAt === 'string' && v.claimedAt
          ? v.claimedAt
          : new Date().toISOString(),
    };
  }

  async claimVoucherForUser(params: {
    userId: string;
    code: string;
    productId?: string;
  }): Promise<{ ok: true; voucher: { code: string; productId?: string } }> {
    const code = params.code.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('voucher code required');
    }

    const row = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { abacContext: true, email: true },
    });
    if (!row) throw new NotFoundException('User not found');
    const current = (row.abacContext ?? null) as any;
    const next = {
      ...(typeof current === 'object' && current ? current : {}),
      commerceVoucher: {
        code,
        productId: params.productId?.trim() || undefined,
        status: 'ACTIVE',
        claimedAt: new Date().toISOString(),
      },
    };

    await this.prisma.user.update({
      where: { id: params.userId },
      data: { abacContext: next },
    });

    await this.appendSecurityAudit(params.userId, 'VOUCHER_CLAIMED', {
      code,
      productId: params.productId ?? null,
    });

    return { ok: true, voucher: { code, productId: params.productId } };
  }

  async revokeVoucherAsSuperAdmin(params: {
    actorUserId: string;
    actorRole: string;
    targetEmail: string;
  }): Promise<{ ok: true }> {
    if (parseAppRoleString(params.actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    const email = params.targetEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, abacContext: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const current = (user.abacContext ?? null) as any;
    const next =
      typeof current === 'object' && current
        ? {
            ...current,
            commerceVoucher: {
              ...(current.commerceVoucher ?? {}),
              status: 'REVOKED',
              revokedAt: new Date().toISOString(),
            },
          }
        : {
            commerceVoucher: {
              status: 'REVOKED',
              revokedAt: new Date().toISOString(),
            },
          };
    await this.prisma.user.update({
      where: { id: user.id },
      data: { abacContext: next },
    });
    await this.appendSecurityAudit(params.actorUserId, 'VOUCHER_REVOKED', {
      targetEmail: email,
      targetUserId: user.id,
    });
    return { ok: true };
  }

  async updateMyProfile(
    userId: string,
    input: {
      fullName?: string;
      email?: string;
      image?: string | null;
      phone?: string;
    },
  ): Promise<{
    ok: true;
    profile: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl: string | null;
      phone: string | null;
    };
  }> {
    const nextName = input.fullName?.trim();
    const nextEmail = input.email?.trim().toLowerCase();
    const nextImageRaw = input.image;
    const nextPhoneRaw =
      input.phone !== undefined ? String(input.phone).trim() : undefined;

    if (nextName !== undefined && nextName.length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters');
    }
    if (nextEmail !== undefined && !nextEmail.includes('@')) {
      throw new BadRequestException('Invalid email address');
    }
    if (nextPhoneRaw !== undefined && nextPhoneRaw.length > 40) {
      throw new BadRequestException('Phone number is too long');
    }

    let nextImage: string | null | undefined = undefined;
    if (nextImageRaw !== undefined) {
      const normalized =
        typeof nextImageRaw === 'string' ? nextImageRaw.trim() : '';
      if (!normalized) {
        nextImage = null;
      } else {
        const isHttp = /^https?:\/\//i.test(normalized);
        const isDataImage = /^data:image\/(png|jpe?g|webp);base64,/i.test(
          normalized,
        );
        if (!isHttp && !isDataImage) {
          throw new BadRequestException(
            'Image must be a valid URL or image file payload',
          );
        }
        if (isDataImage && normalized.length > 1_500_000) {
          throw new BadRequestException('Image file is too large');
        }
        nextImage = normalized;
      }
    }

    try {
      let mergedAbac: Prisma.InputJsonValue | undefined = undefined;
      if (nextPhoneRaw !== undefined) {
        const existing = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { abacContext: true },
        });
        const currentCtx =
          existing?.abacContext &&
          typeof existing.abacContext === 'object' &&
          !Array.isArray(existing.abacContext)
            ? { ...(existing.abacContext as Record<string, unknown>) }
            : {};
        const prevSelf =
          currentCtx.selfProfile &&
          typeof currentCtx.selfProfile === 'object' &&
          !Array.isArray(currentCtx.selfProfile)
            ? { ...(currentCtx.selfProfile as Record<string, unknown>) }
            : {};
        prevSelf.phone = nextPhoneRaw.length > 0 ? nextPhoneRaw : null;
        mergedAbac = {
          ...currentCtx,
          selfProfile: prevSelf,
        } as Prisma.InputJsonValue;
      }

      const row = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(nextEmail !== undefined ? { email: nextEmail } : {}),
          ...(nextImage !== undefined ? { image: nextImage } : {}),
          ...(mergedAbac !== undefined ? { abacContext: mergedAbac } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          abacContext: true,
        },
      });

      const phoneFromCtx = (() => {
        const abac = row.abacContext;
        if (!abac || typeof abac !== 'object' || Array.isArray(abac))
          return null;
        const sp = (abac as Record<string, unknown>).selfProfile;
        if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return null;
        const p = (sp as Record<string, unknown>).phone;
        return typeof p === 'string' && p.trim() ? p.trim() : null;
      })();

      await this.appendSecurityAudit(userId, 'SELF_PROFILE_UPDATED', {
        changed: {
          fullName: nextName !== undefined,
          email: nextEmail !== undefined,
          image: nextImage !== undefined,
          phone: nextPhoneRaw !== undefined,
        },
      });

      return {
        ok: true,
        profile: {
          id: row.id,
          fullName: row.name ?? row.email?.split('@')[0] ?? 'User',
          email: row.email ?? '',
          avatarUrl: row.image,
          phone: phoneFromCtx,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Email already in use');
      }
      throw error;
    }
  }

  async requestAccountDeletion(
    userId: string,
    actorRole: string,
    reason: string,
  ): Promise<{ ok: true; requestId: string }> {
    if (parseAppRoleString(actorRole) === USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin account cannot be deleted');
    }
    const trimmed = String(reason ?? '').trim();
    if (trimmed.length < 80) {
      throw new BadRequestException(
        'Please provide a detailed reason (at least 80 characters).',
      );
    }
    if (trimmed.length > 8000) {
      throw new BadRequestException(
        'Reason is too long (max 8000 characters).',
      );
    }

    let existingPending;
    try {
      existingPending = await this.accountDeletionRequestDelegate.findFirst({
        where: { userId, status: 'PENDING' },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        throw new ServiceUnavailableException(
          'Account deletion is not available until the database migration is applied.',
        );
      }
      throw err;
    }
    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending account deletion request.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let row;
    try {
      row = await this.accountDeletionRequestDelegate.create({
        data: {
          userId,
          reason: trimmed,
          status: 'PENDING',
        },
        select: { id: true },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        throw new ServiceUnavailableException(
          'Account deletion is not available until the database migration is applied.',
        );
      }
      throw err;
    }

    await this.appendSecurityAudit(userId, 'ACCOUNT_DELETION_REQUESTED', {
      requestId: row.id,
      reasonLength: trimmed.length,
    });

    await this.prisma.inboxNotification.create({
      data: {
        userId,
        type: 'ACCOUNT_DELETION_SUBMITTED',
        title: 'Account deletion request submitted',
        body: 'Your request is being reviewed by a Super Admin. You will receive a notification here once a decision is made.',
        payload: { requestId: row.id },
      },
    });

    const superAdmins = await this.prisma.user.findMany({
      where: { appRole: USER_ROLE.SUPER_ADMIN },
      select: { id: true },
    });
    const preview =
      trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
    for (const admin of superAdmins) {
      if (admin.id === userId) continue;
      await this.prisma.inboxNotification.create({
        data: {
          userId: admin.id,
          type: 'ACCOUNT_DELETION_REVIEW',
          title: 'Account deletion approval required',
          body: `User ${user.email ?? userId} requested account deletion.\n\nReason (preview):\n${preview}`,
          payload: {
            requestId: row.id,
            targetUserId: user.id,
            targetEmail: user.email ?? null,
          },
        },
      });
    }

    void this.accountDeletionBroadcast.notifyQueueChanged();

    return { ok: true, requestId: row.id };
  }

  async getMyDeletionStatus(userId: string): Promise<{
    status: 'NONE' | 'PENDING' | 'REJECTED';
    requestId?: string;
    submittedAt?: string;
    reviewNote?: string | null;
    rejectedAt?: string | null;
  }> {
    try {
      const pending = await this.accountDeletionRequestDelegate.findFirst({
        where: { userId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) {
        return {
          status: 'PENDING',
          requestId: pending.id,
          submittedAt: pending.createdAt.toISOString(),
        };
      }
      const last = await this.accountDeletionRequestDelegate.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (last?.status === 'REJECTED') {
        return {
          status: 'REJECTED',
          requestId: last.id,
          reviewNote: last.reviewNote ?? null,
          rejectedAt: last.reviewedAt?.toISOString() ?? null,
        };
      }
      return { status: 'NONE' };
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        return { status: 'NONE' };
      }
      throw err;
    }
  }

  async listPendingAccountDeletionRequests(actorRole: string) {
    if (parseAppRoleString(actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    let rows;
    try {
      rows = await this.accountDeletionRequestDelegate.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: { id: true, email: true, name: true, appRole: true },
          },
        },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        return [];
      }
      throw err;
    }
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      reason: r.reason,
      user: {
        id: r.user.id,
        email: r.user.email ?? '',
        fullName: r.user.name ?? r.user.email?.split('@')[0] ?? 'User',
        role: parseAppRoleString(r.user.appRole ?? ''),
      },
    }));
  }

  async approveAccountDeletionRequest(params: {
    actorUserId: string;
    actorRole: string;
    requestId: string;
  }): Promise<{ ok: true }> {
    if (parseAppRoleString(params.actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    let req;
    try {
      req = await this.accountDeletionRequestDelegate.findUnique({
        where: { id: params.requestId },
        include: {
          user: { select: { id: true, email: true, appRole: true } },
        },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        throw new ServiceUnavailableException(
          'Account deletion is not available until the database migration is applied.',
        );
      }
      throw err;
    }
    if (!req || req.status !== 'PENDING') {
      throw new NotFoundException('Request not found or already processed');
    }
    if (parseAppRoleString(req.user.appRole) === USER_ROLE.SUPER_ADMIN) {
      throw new BadRequestException('Cannot delete a Super Admin account');
    }

    const email = req.user.email?.trim();
    if (email) {
      await this.sendWorkspaceEmail({
        to: email,
        subject: 'Your account will be deleted',
        html: `<p>Your account deletion request has been <strong>approved</strong> by a Super Admin.</p><p>Your account and related sign-in data will be removed according to policy. If you are still signed in on another device, that session will stop working.</p>`,
      });
    }

    await this.appendSecurityAudit(
      params.actorUserId,
      'ACCOUNT_DELETION_APPROVED',
      {
        requestId: req.id,
        targetUserId: req.userId,
        targetEmail: req.user.email ?? null,
      },
    );

    await this.prisma.user.delete({ where: { id: req.userId } });

    void this.accountDeletionBroadcast.notifyQueueChanged();

    return { ok: true };
  }

  async rejectAccountDeletionRequest(params: {
    actorUserId: string;
    actorRole: string;
    requestId: string;
    reviewNote?: string;
  }): Promise<{ ok: true }> {
    if (parseAppRoleString(params.actorRole) !== USER_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    let req;
    try {
      req = await this.accountDeletionRequestDelegate.findUnique({
        where: { id: params.requestId },
        include: { user: { select: { id: true, email: true } } },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        throw new ServiceUnavailableException(
          'Account deletion is not available until the database migration is applied.',
        );
      }
      throw err;
    }
    if (!req || req.status !== 'PENDING') {
      throw new NotFoundException('Request not found or already processed');
    }

    const note = params.reviewNote?.trim() || null;

    try {
      await this.accountDeletionRequestDelegate.update({
        where: { id: req.id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: params.actorUserId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
    } catch (err) {
      if (this.isAccountDeletionTableMissing(err)) {
        this.logger.warn(
          'AccountDeletionRequest table missing; apply database/migrations/028_account_deletion_requests.sql',
        );
        throw new ServiceUnavailableException(
          'Account deletion is not available until the database migration is applied.',
        );
      }
      throw err;
    }

    await this.prisma.inboxNotification.create({
      data: {
        userId: req.userId,
        type: 'ACCOUNT_DELETION_REJECTED',
        title: 'Account deletion request declined',
        body: note
          ? `A Super Admin declined your account deletion request.\n\nNote: ${note}`
          : 'A Super Admin declined your account deletion request.',
        payload: { requestId: req.id },
      },
    });

    await this.appendSecurityAudit(
      params.actorUserId,
      'ACCOUNT_DELETION_REJECTED',
      {
        requestId: req.id,
        targetUserId: req.userId,
        targetEmail: req.user.email ?? null,
      },
    );

    void this.accountDeletionBroadcast.notifyQueueChanged();

    return { ok: true };
  }

  deleteMyAccount(userId: string, actorRole: string): Promise<{ ok: true }> {
    void userId;
    void actorRole;
    throw new ForbiddenException(
      'Direct account deletion is disabled. Open Profile → Delete account, write your reason, and wait for Super Admin approval.',
    );
  }
}
