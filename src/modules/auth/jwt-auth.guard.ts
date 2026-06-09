import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { extractWorkspaceJwt } from './jwt-token.extractor';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtUserPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private readActiveCustomAccess(abac: unknown): {
    customRoleId?: string;
    customAllowedFeatures?: string[];
  } {
    if (!abac || typeof abac !== 'object' || Array.isArray(abac)) {
      return {};
    }
    const ws = (abac as Record<string, unknown>).workspaceCustomRole;
    if (!ws || typeof ws !== 'object' || Array.isArray(ws)) {
      return {};
    }
    const activeId = String((ws as Record<string, unknown>).activeId ?? '').trim();
    const assignment = (ws as Record<string, unknown>).assignment;
    if (
      !activeId ||
      !assignment ||
      typeof assignment !== 'object' ||
      Array.isArray(assignment)
    ) {
      return {};
    }
    const assignmentId = String(
      (assignment as Record<string, unknown>).id ?? '',
    ).trim();
    if (!assignmentId || assignmentId !== activeId) {
      return {};
    }
    const rawFeatures = (assignment as Record<string, unknown>).allowedFeatures;
    const customAllowedFeatures = Array.isArray(rawFeatures)
      ? rawFeatures
          .map((value) => String(value ?? '').trim())
          .filter((value) => !!value)
      : [];
    if (customAllowedFeatures.length === 0) {
      return {};
    }
    return {
      customRoleId: activeId,
      customAllowedFeatures,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string };
      user?: JwtUserPayload;
    }>();
    const bearer = extractWorkspaceJwt(req.headers);
    if (!bearer) {
      throw new UnauthorizedException();
    }
    try {
      const decoded = this.jwt.verify<JwtUserPayload>(bearer);
      const row = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { abacContext: true },
      });
      req.user = {
        ...decoded,
        ...this.readActiveCustomAccess(row?.abacContext),
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
