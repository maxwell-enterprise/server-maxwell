import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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
    // Single-role model: business/internal roles only (exclude SUPER_ADMIN escalation).
    const allowed = new Set<UserRoleString>([
      USER_ROLE.FINANCE,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.SALES,
      USER_ROLE.GATE_KEEPER,
      USER_ROLE.FACILITATOR,
      USER_ROLE.MEMBER,
      USER_ROLE.GUEST,
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
    | { ok: true; mode: 'updated'; userId: string }
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
      return { ok: true, mode: 'updated', userId: existing.id };
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

  async listInternalUsers(actorRole: string) {
    if (parseAppRoleString(actorRole) !== USER_ROLE.SUPER_ADMIN) {
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

    return rows.map((r) => ({
      id: r.id,
      email: r.email ?? '',
      fullName: r.name ?? (r.email?.split('@')[0] ?? 'Unknown User'),
      role: r.appRole,
      avatarUrl: r.image,
      provider: 'email' as const,
    }));
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
}
