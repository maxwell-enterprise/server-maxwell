import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Attaches `req.user` when a valid Bearer JWT is present; otherwise leaves user unset.
 * Always allows the request (for guest checkout + optional logged-in buyer).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: unknown;
    }>();
    const auth = req.headers.authorization;
    const bearer =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7)
        : null;
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
