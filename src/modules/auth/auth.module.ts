import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MembersModule } from '../members/members.module';
import { WorkspaceIdentityModule } from '../workspace-identity/workspace-identity.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { AdminWorkspaceController } from './admin-workspace.controller';
import { WorkspaceMeController } from './workspace-me.controller';

@Module({
  imports: [
    forwardRef(() => MembersModule),
    WorkspaceIdentityModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        process.env.NEXTAUTH_SECRET ||
        'dev-insecure-change-me',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [
    AuthController,
    AdminWorkspaceController,
    WorkspaceMeController,
  ],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
