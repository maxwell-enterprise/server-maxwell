import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceIdentityService } from '../workspace-identity/workspace-identity.service';
import { MembersService } from '../members/members.service';
import { CreateMemberDtoSchema } from '../members/dto';
import { USER_ROLE } from '../workspace-identity/user-role.constants';
import { Resend } from 'resend';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDefaultAvatarUrl(nameOrEmail: string): string {
  const seed = encodeURIComponent((nameOrEmail || 'User').trim());
  return `https://ui-avatars.com/api/?name=${seed}&background=0f172a&color=fff&bold=true`;
}

/** Decoded JWT payload (workspace session). */
export interface JwtUserPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MAGIC_LINK_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly workspace: WorkspaceIdentityService,
    private readonly membersService: MembersService,
  ) {}

  getFrontendBaseUrl(): string {
    return (
      process.env.FRONTEND_URL?.trim() || 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  /**
   * Base URL untuk link auth di email / OAuth redirect ke Nest (`/fe/auth/*`).
   * Production: set `AUTH_BACKEND_ORIGIN` ke origin publik Nest (mis. Railway), supaya tidak
   * bergantung pada rewrite Vercel untuk `/fe`. Lokal: kosongkan → pakai `FRONTEND_URL` + rewrite.
   */
  getAuthBackendOrigin(): string {
    const explicit = process.env.AUTH_BACKEND_ORIGIN?.trim();
    if (explicit) {
      // Defensive: allow operators to paste full URLs (with path) and still behave correctly.
      // We only need the origin for building /fe/auth/* links.
      try {
        const u = new URL(explicit);
        return `${u.protocol}//${u.host}`;
      } catch {
        return explicit.replace(/\/+$/, '');
      }
    }
    return this.getFrontendBaseUrl();
  }

  getGoogleRedirectUri(): string {
    return (
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${this.getFrontendBaseUrl()}/fe/auth/google/callback`
    );
  }

  buildGoogleAuthorizeUrl(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new UnauthorizedException('Google OAuth is not configured');
    }
    const redirect = encodeURIComponent(this.getGoogleRedirectUri());
    const scope = encodeURIComponent('openid email profile');
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=select_account`;
  }

  async handleGoogleCallback(code: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Google OAuth is not configured');
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: this.getGoogleRedirectUri(),
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      throw new UnauthorizedException(`Google token exchange failed: ${t}`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('No access_token from Google');
    }

    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!userRes.ok) {
      throw new UnauthorizedException('Google userinfo failed');
    }
    const profile = (await userRes.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Google account has no email');
    }

    const user = await this.upsertOAuthUser({
      provider: 'google',
      providerAccountId: profile.sub,
      email,
      name: profile.name ?? email.split('@')[0],
      image: profile.picture ?? null,
    });

    await this.runPostOAuthSideEffects(
      user.id,
      email,
      user.name ?? email.split('@')[0],
    );

    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    return this.signAccessToken(fresh.id, fresh.email!, fresh.appRole);
  }

  /** Invites, CRM sync, etc. must not block login if tables/config drift. */
  private async runPostOAuthSideEffects(
    userId: string,
    email: string,
    displayName: string,
  ): Promise<void> {
    try {
      await this.workspace.applyPendingRoleInvites(userId, email);
    } catch (err) {
      this.logger.warn(
        `applyPendingRoleInvites failed for ${email}: ${err instanceof Error ? err.message : err}`,
      );
    }
    try {
      await this.workspace.ensureBootstrapSuperAdmin(userId, email);
    } catch (err) {
      this.logger.warn(
        `ensureBootstrapSuperAdmin failed for ${email}: ${err instanceof Error ? err.message : err}`,
      );
    }
    try {
      await this.syncCrmMember(displayName, email);
    } catch (err) {
      this.logger.warn(
        `syncCrmMember failed for ${email}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async upsertOAuthUser(input: {
    provider: string;
    providerAccountId: string;
    email: string;
    name: string;
    image: string | null;
  }) {
    const existingAccount = await this.prisma.account.findFirst({
      where: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
      include: { user: true },
    });

    if (existingAccount) {
      return this.prisma.user.update({
        where: { id: existingAccount.userId },
        data: {
          name: input.name,
          image: input.image ?? undefined,
          emailVerified: new Date(),
        },
      });
    }

    let user = await this.prisma.user.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          image: input.image,
          emailVerified: new Date(),
          appRole: USER_ROLE.MEMBER,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: input.name,
          image: input.image ?? undefined,
          emailVerified: new Date(),
        },
      });
    }

    const linked = await this.prisma.account.findFirst({
      where: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    });
    if (!linked) {
      await this.prisma.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          access_token: 'unused',
        },
      });
    }

    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  private async syncCrmMember(name: string, email: string): Promise<void> {
    const joinMonth = new Date().toISOString().slice(0, 7);
    try {
      const dto = CreateMemberDtoSchema.parse({
        name,
        email,
        phone: '',
        joinMonth,
        lifecycleStage: 'GUEST',
      });
      await this.membersService.create(dto);
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.warn(
        `CRM member sync skipped for ${email}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  signAccessToken(userId: string, email: string, appRole: string): string {
    return this.jwt.sign({
      sub: userId,
      email,
      role: appRole,
    });
  }

  async getSessionPayload(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    abacContext: unknown;
  } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        appRole: true,
        abacContext: true,
      },
    });
    if (!row?.email) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      role: row.appRole,
      abacContext: row.abacContext,
    };
  }

  async sendMagicLinkEmail(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new UnauthorizedException('Invalid email');
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() ?? 'onboarding@resend.dev';
    if (!resendKey) {
      throw new UnauthorizedException('RESEND_API_KEY is not configured');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + this.MAGIC_LINK_TTL_MS);

    // Keep previous (still-valid) links working. Only clean up expired tokens.
    await this.prisma.verificationToken.deleteMany({
      where: { identifier: email, expires: { lt: new Date() } },
    });
    await this.prisma.verificationToken.create({
      data: { identifier: email, token, expires },
    });

    const verifyUrl = `${this.getAuthBackendOrigin()}/fe/auth/email/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    const brandRaw =
      process.env.EMAIL_BRAND_NAME?.trim() || 'Maxwell Leadership Enterprise';
    const brandEsc = escapeHtml(brandRaw);
    const fe = this.getFrontendBaseUrl();
    const siteUrl = (
      process.env.EMAIL_PUBLIC_BASE_URL?.trim() || fe
    ).replace(/\/+$/, '');
    const logoUrl = process.env.EMAIL_LOGO_URL?.trim() || `${siteUrl}/mxwel.png`;
    const emailSubject =
      process.env.EMAIL_SUBJECT?.trim() ||
      'Account access verification — Maxwell Leadership Enterprise';

    let greetingName = 'there';
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
      select: { name: true },
    });
    if (existingUser?.name?.trim()) {
      greetingName = escapeHtml(existingUser.name.trim());
    }

    const ttlMinutes = Math.max(1, Math.round(this.MAGIC_LINK_TTL_MS / 60_000));
    const year = new Date().getFullYear();

    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: emailSubject,
      html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(emailSubject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#021A54;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.55;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background:#021A54;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
            <tr>
              <td style="padding:28px 24px 20px 24px;text-align:center;background:#ffffff;">
                <img src="${logoUrl}" width="96" height="96" alt="${brandEsc}" style="display:inline-block;border-radius:4px;border:1px solid #e5e7eb;object-fit:cover;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px 24px;background:#F0F9FF;">
                <p style="margin:0 0 14px 0;font-size:15px;color:#0f172a;font-weight:700;">Hello ${greetingName},</p>
                <p style="margin:0 0 12px 0;font-size:14px;color:#1e293b;">
                  We’re sending this email to verify a sign-in request for your <strong>${brandEsc}</strong> account. For your security, access is only possible through an official link sent to your registered email address.
                </p>
                <p style="margin:0 0 12px 0;font-size:14px;color:#1e293b;">
                  Click the button below to continue. The link is confidential, may only be used in line with our security policy, and expires automatically after a short period to reduce the risk of misuse.
                </p>
                <p style="margin:0 0 22px 0;font-size:14px;color:#1e293b;">
                  If you didn’t request this link, you can ignore this message—your account remains secure as long as no one else can access your inbox.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
                  <tr>
                    <td align="center" style="padding:0 0 18px 0;">
                      <a href="${verifyUrl}" style="display:inline-block;background:#021A54;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:4px;font-weight:700;font-size:14px;">Sign in to your account</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 18px 0;font-size:12px;color:#475569;text-align:center;">
                  This link is valid for <strong>${ttlMinutes} minutes</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 20px;background:#F3F4F6;text-align:center;font-size:12px;color:#4b5563;">
                <p style="margin:0 0 10px 0;">© ${year} Maxwell Leadership Enterprise. All rights reserved.</p>
                <p style="margin:0 0 10px 0;">
                  <a href="${siteUrl}" style="color:#021A54;text-decoration:underline;">Visit website</a>
                  <span style="color:#9ca3af;"> | </span>
                  <a href="${siteUrl}/support" style="color:#021A54;text-decoration:underline;">Contact us</a>
                </p>
                <p style="margin:0 0 8px 0;">
                  <a href="${siteUrl}" style="color:#021A54;text-decoration:underline;">Facebook</a>
                  <span style="color:#9ca3af;"> </span>
                  <a href="${siteUrl}" style="color:#021A54;text-decoration:underline;">Instagram</a>
                </p>
                <p style="margin:0;font-size:11px;color:#6b7280;">
                  You’re receiving this email because you have an account or sign-in request for <strong>${brandEsc}</strong>. Learn more: <a href="${siteUrl}" style="color:#021A54;text-decoration:underline;">Maxwell Leadership Enterprise</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    });
    if (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  async verifyEmailToken(email: string, token: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const row = await this.prisma.verificationToken.findFirst({
      where: { identifier: normalized, token },
    });
    if (!row || row.expires < new Date()) {
      throw new UnauthorizedException('Invalid or expired link');
    }

    await this.prisma.verificationToken.deleteMany({
      where: { identifier: normalized, token },
    });

    let user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    });

    if (!user) {
      const defaultName = normalized.split('@')[0];
      user = await this.prisma.user.create({
        data: {
          email: normalized,
          name: defaultName,
          image: buildDefaultAvatarUrl(defaultName),
          emailVerified: new Date(),
          appRole: USER_ROLE.MEMBER,
        },
      });
    } else {
      const fallbackName = user.name?.trim() || normalized.split('@')[0];
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          image: user.image ?? buildDefaultAvatarUrl(fallbackName),
        },
      });
    }

    await this.runPostOAuthSideEffects(
      user.id,
      normalized,
      user.name ?? normalized.split('@')[0],
    );

    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    return this.signAccessToken(fresh.id, fresh.email!, fresh.appRole);
  }
}
