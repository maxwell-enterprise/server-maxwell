import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { appendInvitationEmailLog } from '../../common/logging/invitation-email-log';
import { WorkspaceIdentityService } from '../workspace-identity/workspace-identity.service';
import { MembersService } from '../members/members.service';
import { CreateMemberDtoSchema } from '../members/dto';
import {
  parseAppRoleList,
  parseAppRoleString,
  USER_ROLE,
} from '../workspace-identity/user-role.constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function buildDefaultAvatarUrl(nameOrEmail: string): string {
  const seed = encodeURIComponent((nameOrEmail || 'User').trim());
  return `https://ui-avatars.com/api/?name=${seed}&background=0f172a&color=fff&bold=true`;
}

function isLocalUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

function normalizeSingleRedirectUrl(
  rawValue: string | undefined,
  fallback: string,
): string | null {
  const candidates = String(rawValue ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const pool = candidates.length > 0 ? candidates : [fallback];

  for (const candidate of pool) {
    if (!URL.canParse(candidate)) continue;
    try {
      const url = new URL(candidate);
      return url.toString().replace(/\/+$/, '');
    } catch {
      continue;
    }
  }

  return null;
}

function formatSupabaseAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? 'unknown error');
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
    error_code?: unknown;
  };

  const parts = [
    typeof candidate.message === 'string' && candidate.message.trim()
      ? candidate.message.trim()
      : null,
    typeof candidate.code === 'string' && candidate.code.trim()
      ? `code=${candidate.code.trim()}`
      : null,
    typeof candidate.error_code === 'string' && candidate.error_code.trim()
      ? `error_code=${candidate.error_code.trim()}`
      : null,
    typeof candidate.status === 'number' ? `status=${candidate.status}` : null,
    typeof candidate.name === 'string' && candidate.name.trim()
      ? `name=${candidate.name.trim()}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : 'unknown error';
}

/**
 * Node/undici `fetch` failures: DNS, firewall, offline, timeout.
 * Message/cause shape varies by Node version — do not rely only on `message === 'fetch failed'`.
 */
function isOutboundNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('fetch failed')) return true;
  if (
    /getaddrinfo|enotfound|eai_again|etimedout|econnrefused|enetunreach|econnreset/i.test(
      msg,
    )
  ) {
    return true;
  }
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as NodeJS.ErrnoException).code;
    if (
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ENETUNREACH'
    ) {
      return true;
    }
  }
  return false;
}

/** Decoded JWT payload (workspace session). */
export interface JwtUserPayload {
  sub: string;
  email: string;
  role: string;
  customRoleId?: string;
  customAllowedFeatures?: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabaseAdminClient: SupabaseClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly workspace: WorkspaceIdentityService,
    private readonly membersService: MembersService,
  ) {}

  getFrontendBaseUrl(): string {
    const explicit = process.env.FRONTEND_URL?.trim();
    const allowNonLocalInDev =
      process.env.ALLOW_NON_LOCAL_AUTH_REDIRECT_IN_DEV === 'true';

    if (!explicit) return 'http://localhost:3000';
    if (process.env.NODE_ENV !== 'production' && !allowNonLocalInDev) {
      return isLocalUrl(explicit) ? explicit.replace(/\/+$/, '') : 'http://localhost:3000';
    }
    return explicit.replace(/\/+$/, '');
  }

  private resolveGiftInviteRedirectUrl(): string | null {
    const configured = normalizeSingleRedirectUrl(
      process.env.SUPABASE_GIFT_INVITE_REDIRECT_URL,
      this.getFrontendBaseUrl(),
    );
    if (!configured) return null;

    const allowNonLocalInDev =
      process.env.ALLOW_NON_LOCAL_AUTH_REDIRECT_IN_DEV === 'true';
    if (process.env.NODE_ENV !== 'production' && !allowNonLocalInDev) {
      return isLocalUrl(configured) ? configured : this.getFrontendBaseUrl();
    }

    return configured;
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
    const fallback = `${this.getFrontendBaseUrl()}/fe/auth/google/callback`;
    const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
    const allowNonLocalInDev =
      process.env.ALLOW_NON_LOCAL_AUTH_REDIRECT_IN_DEV === 'true';

    if (!explicit) return fallback;
    if (process.env.NODE_ENV !== 'production' && !allowNonLocalInDev) {
      return isLocalUrl(explicit) ? explicit : fallback;
    }
    return explicit;
  }

  private getSupabaseAuthConfig():
    | { url: string; serviceRoleKey: string }
    | null {
    const url = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey) return null;
    return { url, serviceRoleKey };
  }

  private isSupabaseAuthEnabled(): boolean {
    const explicit = (process.env.AUTH_PROVIDER ?? '').trim().toLowerCase();
    if (explicit === 'legacy') return false;
    return this.getSupabaseAuthConfig() !== null;
  }

  private getSupabaseAdminClient(): SupabaseClient {
    const config = this.getSupabaseAuthConfig();
    if (!config) {
      throw new UnauthorizedException('Supabase Auth is not configured');
    }
    if (!this.supabaseAdminClient) {
      const fetchWithTimeout: typeof fetch = async (input, init) => {
        const timeoutMs = 30_000;
        const signal = AbortSignal.timeout(timeoutMs);
        return fetch(input, {
          ...init,
          signal:
            init && 'signal' in init && init.signal
              ? AbortSignal.any([init.signal, signal])
              : signal,
        });
      };
      this.supabaseAdminClient = createClient(config.url, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: fetchWithTimeout },
      });
    }
    return this.supabaseAdminClient;
  }

  private buildSupabaseFrontendCallbackUrl(rawReturnSearch?: string): string {
    const base = this.getFrontendBaseUrl().replace(/\/+$/, '');
    const params = new URLSearchParams({ provider: 'supabase' });
    const normalizedReturnSearch = (() => {
      const raw = String(rawReturnSearch ?? '').trim();
      if (!raw) return '';
      if (raw.length > 1500) return '';
      return raw.startsWith('?') ? raw : `?${raw}`;
    })();
    if (normalizedReturnSearch) {
      params.set('returnTo', normalizedReturnSearch);
    }
    return `${base}/auth/callback?${params.toString()}`;
  }

  buildGoogleAuthorizeUrl(): string {
    if (this.isSupabaseAuthEnabled()) {
      const cfg = this.getSupabaseAuthConfig();
      if (!cfg) {
        throw new UnauthorizedException('Supabase Auth is not configured');
      }
      const callback = this.buildSupabaseFrontendCallbackUrl();
      const url = new URL(`${cfg.url.replace(/\/+$/, '')}/auth/v1/authorize`);
      url.searchParams.set('provider', 'google');
      url.searchParams.set('redirect_to', callback);
      return url.toString();
    }
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

    const tokenFetchOpts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(25_000),
    };

    let tokenRes: Response;
    try {
      tokenRes = await fetch(
        'https://oauth2.googleapis.com/token',
        tokenFetchOpts,
      );
    } catch (err) {
      if (isOutboundNetworkFailure(err)) {
        this.logger.warn(
          `Google token exchange unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Sign-in could not reach Google (network or DNS). Ensure you are online and oauth2.googleapis.com resolves.',
        );
      }
      throw err;
    }

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      throw new UnauthorizedException(`Google token exchange failed: ${t}`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('No access_token from Google');
    }

    let userRes: Response;
    try {
      userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (isOutboundNetworkFailure(err)) {
        this.logger.warn(
          `Google userinfo unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Cannot reach Google userinfo. Check your network connection.',
        );
      }
      throw err;
    }
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

  async exchangeSupabaseAccessToken(rawAccessToken: string): Promise<string> {
    if (!this.isSupabaseAuthEnabled()) {
      throw new UnauthorizedException('Supabase Auth is not enabled');
    }
    const accessToken = String(rawAccessToken ?? '').trim();
    if (!accessToken) {
      throw new UnauthorizedException('Supabase access token is required');
    }

    const supabase = this.getSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      throw new UnauthorizedException(
        error?.message || 'Supabase session is invalid or expired',
      );
    }

    const supabaseUser = data.user as unknown as {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
      app_metadata?: Record<string, unknown> | null;
      identities?: Array<Record<string, unknown>> | null;
    };

    const email = String(supabaseUser.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Supabase account has no email');
    }

    const userMeta =
      supabaseUser.user_metadata && typeof supabaseUser.user_metadata === 'object'
        ? supabaseUser.user_metadata
        : {};
    const appMeta =
      supabaseUser.app_metadata && typeof supabaseUser.app_metadata === 'object'
        ? supabaseUser.app_metadata
        : {};
    const identities = Array.isArray(supabaseUser.identities)
      ? supabaseUser.identities
      : [];

    const providerRaw = String(
      appMeta.provider ??
        identities[0]?.provider ??
        userMeta.provider ??
        'email',
    )
      .trim()
      .toLowerCase();
    const provider = providerRaw || 'email';

    const matchedIdentity =
      identities.find((i) => String(i?.provider ?? '').trim().toLowerCase() === provider) ??
      identities[0] ??
      null;
    const providerAccountId = String(
      matchedIdentity?.id ??
        matchedIdentity?.user_id ??
        appMeta.provider_id ??
        supabaseUser.id,
    ).trim();

    const displayName = String(
      userMeta.full_name ??
        userMeta.name ??
        userMeta.display_name ??
        email.split('@')[0],
    ).trim();
    const avatar = String(
      userMeta.avatar_url ?? userMeta.picture ?? '',
    ).trim();

    const user = await this.upsertOAuthUser({
      provider,
      providerAccountId: providerAccountId || supabaseUser.id,
      email,
      name: displayName || email.split('@')[0],
      image: avatar || null,
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
      const u = existingAccount.user;
      // Do not overwrite display name / uploaded avatar on every OAuth login — users edit these in Account Settings.
      const data: {
        emailVerified: Date;
        name?: string;
        image?: string | null;
      } = { emailVerified: new Date() };
      if (!u.name?.trim()) {
        data.name = input.name;
      }
      const hasCustomDataAvatar = !!u.image?.startsWith('data:image/');
      if (!hasCustomDataAvatar) {
        data.image = input.image ?? undefined;
      }
      return this.prisma.user.update({
        where: { id: existingAccount.userId },
        data,
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
      const data: {
        emailVerified: Date;
        name?: string;
        image?: string | null;
      } = { emailVerified: new Date() };
      if (!user.name?.trim()) {
        data.name = input.name;
      }
      const hasCustomDataAvatar = !!user.image?.startsWith('data:image/');
      if (!hasCustomDataAvatar) {
        data.image = input.image ?? undefined;
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data,
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
        lifecycleStage: 'IDENTIFIED',
      });
      await this.membersService.create(dto);
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.warn(
        `CRM member sync skipped for ${email}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  signAccessToken(
    userId: string,
    email: string,
    appRole: string,
    opts?: { customRoleId?: string },
  ): string {
    const activeRole = parseAppRoleString(appRole);
    const payload: JwtUserPayload = {
      sub: userId,
      email,
      role: activeRole,
    };
    if (typeof opts?.customRoleId === 'string' && opts.customRoleId.trim()) {
      payload.customRoleId = opts.customRoleId.trim();
    }
    return this.jwt.sign(payload);
  }

  async getSessionPayload(
    userId: string,
    activeRoleHint?: string,
    activeCustomRoleIdHint?: string,
  ): Promise<{
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    roles: string[];
    phone: string | null;
    jobTitle: string | null;
    company: string | null;
    domicile: string | null;
    instagram: string | null;
    linkedinUrl: string | null;
    abacContext: unknown;
    customRole: {
      id: string;
      name: string;
      allowedFeatures: string[];
      createdAt: string;
      locked: true;
    } | null;
    activeCustomRoleId: string | null;
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
    const selfProfile = AuthService.readSelfProfile(row.abacContext);
    const phone = selfProfile.phone;
    const assignedRoles = parseAppRoleList(row.appRole);
    const activeRole = assignedRoles.includes(parseAppRoleString(activeRoleHint))
      ? parseAppRoleString(activeRoleHint)
      : assignedRoles[0];
    const { assignment, activeCustomRoleId } =
      AuthService.readWorkspaceCustomRole(row.abacContext);
    const hintedCustomId = String(activeCustomRoleIdHint ?? '').trim();
    const finalActiveCustomRoleId =
      assignment && hintedCustomId && hintedCustomId === assignment.id
        ? hintedCustomId
        : activeCustomRoleId;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      role: activeRole,
      roles: assignedRoles,
      phone,
      jobTitle: selfProfile.jobTitle,
      company: selfProfile.company,
      domicile: selfProfile.domicile,
      instagram: selfProfile.instagram,
      linkedinUrl: selfProfile.linkedinUrl,
      abacContext: row.abacContext,
      customRole: assignment,
      activeCustomRoleId: finalActiveCustomRoleId,
    };
  }

  private static readSelfProfile(abac: unknown): {
    phone: string | null;
    jobTitle: string | null;
    company: string | null;
    domicile: string | null;
    instagram: string | null;
    linkedinUrl: string | null;
  } {
    const empty = {
      phone: null,
      jobTitle: null,
      company: null,
      domicile: null,
      instagram: null,
      linkedinUrl: null,
    };
    if (!abac || typeof abac !== 'object' || Array.isArray(abac)) return empty;
    const sp = (abac as Record<string, unknown>).selfProfile;
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return empty;
    const read = (key: string): string | null => {
      const value = (sp as Record<string, unknown>)[key];
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    };
    return {
      phone: read('phone'),
      jobTitle: read('jobTitle'),
      company: read('company'),
      domicile: read('domicile'),
      instagram: read('instagram'),
      linkedinUrl: read('linkedinUrl'),
    };
  }

  private static readWorkspaceCustomRole(abac: unknown): {
    assignment: {
      id: string;
      name: string;
      allowedFeatures: string[];
      createdAt: string;
      locked: true;
    } | null;
    activeCustomRoleId: string | null;
  } {
    if (!abac || typeof abac !== 'object' || Array.isArray(abac)) {
      return { assignment: null, activeCustomRoleId: null };
    }
    const ws = (abac as Record<string, unknown>).workspaceCustomRole;
    if (!ws || typeof ws !== 'object' || Array.isArray(ws)) {
      return { assignment: null, activeCustomRoleId: null };
    }
    const assignmentRaw = (ws as Record<string, unknown>).assignment;
    if (
      !assignmentRaw ||
      typeof assignmentRaw !== 'object' ||
      Array.isArray(assignmentRaw)
    ) {
      return { assignment: null, activeCustomRoleId: null };
    }
    const id = String((assignmentRaw as Record<string, unknown>).id ?? '').trim();
    const name = String((assignmentRaw as Record<string, unknown>).name ?? '').trim();
    const createdAt = String(
      (assignmentRaw as Record<string, unknown>).createdAt ?? '',
    ).trim();
    const allowedFeaturesRaw = (assignmentRaw as Record<string, unknown>)
      .allowedFeatures;
    const allowedFeatures = Array.isArray(allowedFeaturesRaw)
      ? allowedFeaturesRaw
          .map((v) => String(v ?? '').trim())
          .filter((v) => !!v)
      : [];
    if (!id || !name || !createdAt || allowedFeatures.length === 0) {
      return { assignment: null, activeCustomRoleId: null };
    }
    const activeCustomRoleId = String(
      (ws as Record<string, unknown>).activeId ?? '',
    ).trim();
    return {
      assignment: {
        id,
        name,
        allowedFeatures,
        createdAt,
        locked: true,
      },
      activeCustomRoleId: activeCustomRoleId || null,
    };
  }

  async sendMagicLinkEmail(
    rawEmail: string,
    rawReturnSearch?: string,
  ): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new UnauthorizedException('Invalid email');
    }

    if (!this.isSupabaseAuthEnabled()) {
      throw new UnauthorizedException(
        'Supabase Auth is not configured for magic link login',
      );
    }

    const supabase = this.getSupabaseAdminClient();
    const callbackUrl = this.buildSupabaseFrontendCallbackUrl(rawReturnSearch);
    try {
      const runOtp = () =>
        supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: callbackUrl,
          },
        });
      let result = await runOtp();
      // Transient DNS/connect timeout is common on cold/restricted networks; retry once.
      if (result.error && isOutboundNetworkFailure(result.error)) {
        result = await runOtp();
      }
      const { error } = result;
      if (error) {
        const msg = String(error.message ?? '').trim();
        throw new UnauthorizedException(
          msg ||
            'Magic link provider rejected the request. Check Supabase Auth email provider settings and redirect URL allow-list.',
        );
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      if (isOutboundNetworkFailure(err)) {
        this.logger.warn(
          `Supabase magic link API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Cannot reach Supabase Auth to send magic link (network/DNS timeout).',
        );
      }
      this.logger.error(
        `Supabase magic link unexpected failure: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException(
        'Magic link provider configuration is invalid. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and Supabase Auth email provider settings.',
      );
    }
  }

  /**
   * Supabase Auth admin: send the standard invite email so the recipient can set a password
   * and land on the app (see `SUPABASE_GIFT_INVITE_REDIRECT_URL`). Called after a ticket gift
   * is persisted; failures are logged only and must not roll back the gift.
   */
  async sendGiftTicketRecipientSupabaseInvite(params: {
    giftId?: string | null;
    email: string;
    itemName?: string | null;
    donorName?: string | null;
  }): Promise<void> {
    const email = params.email.trim().toLowerCase();
    if (!email.includes('@')) {
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_skipped',
        status: 'skipped',
        targetEmail: email || params.email,
        giftId: params.giftId ?? null,
        itemName: params.itemName ?? null,
        donorName: params.donorName ?? null,
        reason: 'invalid recipient email',
      });
      return;
    }

    if (!this.isSupabaseAuthEnabled()) {
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_skipped',
        status: 'skipped',
        targetEmail: email,
        giftId: params.giftId ?? null,
        itemName: params.itemName ?? null,
        donorName: params.donorName ?? null,
        reason: 'supabase auth not enabled',
      });
      this.logger.debug(
        'Gift ticket Supabase invite skipped: Supabase Auth not enabled (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or AUTH_PROVIDER=legacy disables this).',
      );
      return;
    }

    const redirectTo = this.resolveGiftInviteRedirectUrl();
    if (!redirectTo) {
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_skipped',
        status: 'skipped',
        targetEmail: email,
        giftId: params.giftId ?? null,
        itemName: params.itemName ?? null,
        donorName: params.donorName ?? null,
        reason: 'invalid gift invite redirect url',
      });
      this.logger.warn(
        `Gift ticket Supabase invite skipped: invalid SUPABASE_GIFT_INVITE_REDIRECT_URL`,
      );
      return;
    }

    const supabase = this.getSupabaseAdminClient();
    const meta: Record<string, unknown> = {
      invited_via: 'ticket_gift',
    };
    if (params.itemName?.trim()) {
      meta.item_name = params.itemName.trim();
    }
    if (params.donorName?.trim()) {
      meta.donor_name = params.donorName.trim();
    }

    await appendInvitationEmailLog({
      event: 'manage_invitation_email_dispatch_started',
      status: 'started',
      targetEmail: email,
      giftId: params.giftId ?? null,
      itemName: params.itemName ?? null,
      donorName: params.donorName ?? null,
      metadata: {
        redirectTo,
        provider: 'supabase_invite',
      },
    });

    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: meta,
      });
      if (!error) {
        await appendInvitationEmailLog({
          event: 'manage_invitation_email_dispatch_sent',
          status: 'sent',
          targetEmail: email,
          giftId: params.giftId ?? null,
          itemName: params.itemName ?? null,
          donorName: params.donorName ?? null,
          metadata: {
            redirectTo,
            provider: 'supabase_invite',
          },
        });
        return;
      }
      const msg = formatSupabaseAuthError(error);
      if (
        /already been registered|already exists|already registered|duplicate/i.test(
          msg,
        )
      ) {
        await appendInvitationEmailLog({
          event: 'manage_invitation_email_dispatch_fallback_magic_link',
          status: 'fallback',
          targetEmail: email,
          giftId: params.giftId ?? null,
          itemName: params.itemName ?? null,
          donorName: params.donorName ?? null,
          reason: msg || 'recipient already exists in auth',
          metadata: {
            redirectTo,
            provider: 'supabase_invite',
          },
        });
        this.logger.log(
          `Supabase gift invite: user already in Auth, sending magic link email (${email})`,
        );
        await this.sendGiftTicketMagicLinkForExistingAuthUser(
          email,
          redirectTo,
          params.giftId ?? null,
          params.itemName ?? null,
          params.donorName ?? null,
        );
        return;
      }
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_failed',
        status: 'failed',
        targetEmail: email,
        giftId: params.giftId ?? null,
        itemName: params.itemName ?? null,
        donorName: params.donorName ?? null,
        reason: msg || 'unknown error',
        metadata: {
          redirectTo,
          provider: 'supabase_invite',
        },
      });
      this.logger.warn(
        `Supabase gift invite failed for ${email}: ${msg || 'unknown error'} (redirectTo=${redirectTo})`,
      );
    } catch (err) {
      if (isOutboundNetworkFailure(err)) {
        await appendInvitationEmailLog({
          event: 'manage_invitation_email_dispatch_failed',
          status: 'failed',
          targetEmail: email,
          giftId: params.giftId ?? null,
          itemName: params.itemName ?? null,
          donorName: params.donorName ?? null,
          reason: err instanceof Error ? err.message : String(err),
          metadata: {
            redirectTo,
            provider: 'supabase_invite',
            failureType: 'network',
          },
        });
        this.logger.warn(
          `Supabase gift invite unreachable for ${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_dispatch_failed',
        status: 'failed',
        targetEmail: email,
        giftId: params.giftId ?? null,
        itemName: params.itemName ?? null,
        donorName: params.donorName ?? null,
        reason: err instanceof Error ? err.message : String(err),
        metadata: {
          redirectTo,
          provider: 'supabase_invite',
          failureType: 'unexpected',
        },
      });
      this.logger.warn(
        `Supabase gift invite unexpected error for ${email}: ${err instanceof Error ? err.message : String(err)} (redirectTo=${redirectTo})`,
      );
    }
  }

  /**
   * Recipients who already exist in Supabase Auth cannot receive another `inviteUserByEmail`.
   * In that case we send a **magic link** (OTP email) to the same address so they can sign in
   * at `emailRedirectTo` (same URL as new invites).
   */
  private async sendGiftTicketMagicLinkForExistingAuthUser(
    email: string,
    emailRedirectTo: string,
    giftId?: string | null,
    itemName?: string | null,
    donorName?: string | null,
  ): Promise<void> {
    const supabase = this.getSupabaseAdminClient();
    const runOtp = () =>
      supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo,
        },
      });
    try {
      let result = await runOtp();
      if (result.error && isOutboundNetworkFailure(result.error)) {
        result = await runOtp();
      }
      const { error } = result;
      if (error) {
        const msg = formatSupabaseAuthError(error);
        await appendInvitationEmailLog({
          event: 'manage_invitation_email_magic_link_failed',
          status: 'failed',
          targetEmail: email,
          giftId: giftId ?? null,
          itemName: itemName ?? null,
          donorName: donorName ?? null,
          reason: msg || 'unknown error',
          metadata: {
            redirectTo: emailRedirectTo,
            provider: 'supabase_magic_link',
          },
        });
        this.logger.warn(
          `Supabase gift magic link (existing Auth user) failed for ${email}: ${msg || 'unknown error'} (redirectTo=${emailRedirectTo})`,
        );
        return;
      }
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_magic_link_sent',
        status: 'sent',
        targetEmail: email,
        giftId: giftId ?? null,
        itemName: itemName ?? null,
        donorName: donorName ?? null,
        metadata: {
          redirectTo: emailRedirectTo,
          provider: 'supabase_magic_link',
        },
      });
      this.logger.log(
        `Supabase gift: magic link email sent for existing Auth user ${email}`,
      );
    } catch (err) {
      if (isOutboundNetworkFailure(err)) {
        await appendInvitationEmailLog({
          event: 'manage_invitation_email_magic_link_failed',
          status: 'failed',
          targetEmail: email,
          giftId: giftId ?? null,
          itemName: itemName ?? null,
          donorName: donorName ?? null,
          reason: err instanceof Error ? err.message : String(err),
          metadata: {
            redirectTo: emailRedirectTo,
            provider: 'supabase_magic_link',
            failureType: 'network',
          },
        });
        this.logger.warn(
          `Supabase gift magic link unreachable for ${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      await appendInvitationEmailLog({
        event: 'manage_invitation_email_magic_link_failed',
        status: 'failed',
        targetEmail: email,
        giftId: giftId ?? null,
        itemName: itemName ?? null,
        donorName: donorName ?? null,
        reason: err instanceof Error ? err.message : String(err),
        metadata: {
          redirectTo: emailRedirectTo,
          provider: 'supabase_magic_link',
          failureType: 'unexpected',
        },
      });
      this.logger.warn(
        `Supabase gift magic link unexpected error for ${email}: ${err instanceof Error ? err.message : String(err)}`,
      );
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
