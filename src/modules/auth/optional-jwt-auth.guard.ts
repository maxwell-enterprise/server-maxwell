import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { extractWorkspaceJwt } from './jwt-token.extractor';

/**
 * Attaches `req.user` when a valid Bearer JWT is present; otherwise leaves user unset.
 * Always allows the request (for guest checkout + optional logged-in buyer).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string };
      user?: unknown;
    }>();
    const bearer = extractWorkspaceJwt(req.headers);
    if (!bearer) {
      return true;
    }
    try {
      req.user = this.jwt.verify(bearer);
    } catch {
      // Ignore invalid/expired tokens for public checkout routes.
    }
    return true;
  }
}
