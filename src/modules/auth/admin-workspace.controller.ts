import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { WorkspaceIdentityService } from '../workspace-identity/workspace-identity.service';
import type { JwtUserPayload } from './auth.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminWorkspaceController {
  constructor(private readonly workspace: WorkspaceIdentityService) {}

  @Get('internal-users')
  internalUsers(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.listInternalUsers(req.user.role);
  }

  @Post('role-invites')
  roleInvites(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { email?: string; targetRole?: string },
  ) {
    return this.workspace.postRoleInvite({
      actorUserId: req.user.sub,
      actorRole: req.user.role,
      email: body.email ?? '',
      targetRole: body.targetRole ?? '',
    });
  }

  @Patch('users/abac')
  async abac(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { email?: string; abacContext?: Prisma.InputJsonValue },
  ) {
    await this.workspace.patchUserAbac({
      actorUserId: req.user.sub,
      actorRole: req.user.role,
      email: body.email ?? '',
      abacContext: body.abacContext,
    });
    return { ok: true };
  }

  @Post('vouchers/revoke')
  async revokeVoucher(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { email?: string },
  ) {
    return this.workspace.revokeVoucherAsSuperAdmin({
      actorUserId: req.user.sub,
      actorRole: req.user.role,
      targetEmail: String(body?.email ?? ''),
    });
  }

  @Get('account-deletion-requests')
  listAccountDeletionRequests(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.listPendingAccountDeletionRequests(req.user.role);
  }

  @Post('account-deletion-requests/:id/approve')
  approveAccountDeletion(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    return this.workspace.approveAccountDeletionRequest({
      actorUserId: req.user.sub,
      actorRole: req.user.role,
      requestId: id,
    });
  }

  @Post('account-deletion-requests/:id/reject')
  rejectAccountDeletion(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: { reviewNote?: string },
  ) {
    return this.workspace.rejectAccountDeletionRequest({
      actorUserId: req.user.sub,
      actorRole: req.user.role,
      requestId: id,
      reviewNote: body?.reviewNote,
    });
  }
}
