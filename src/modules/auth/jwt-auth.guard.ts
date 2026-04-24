import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { extractWorkspaceJwt } from './jwt-token.extractor';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string };
      user?: unknown;
    }>();
    const bearer = extractWorkspaceJwt(req.headers);
    if (!bearer) {
      throw new UnauthorizedException();
    }
    try {
      req.user = this.jwt.verify(bearer);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
