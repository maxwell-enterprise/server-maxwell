import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Body,
  Post,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { WorkspaceIdentityService } from '../workspace-identity/workspace-identity.service';
import type { JwtUserPayload } from './auth.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class WorkspaceMeController {
  constructor(
    private readonly workspace: WorkspaceIdentityService,
    private readonly auth: AuthService,
  ) {}

  @Get('rbac-tasks')
  rbacTasks(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.getRbacTasksForUser(req.user.sub);
  }

  @Patch('inbox/:id/read')
  async markInboxRead(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    const ok = await this.workspace.markInboxRead(req.user.sub, id);
    if (!ok) {
      throw new NotFoundException();
    }
    return { ok: true };
  }

  @Get('voucher')
  async getVoucher(@Req() req: { user: JwtUserPayload }) {
    const v = await this.workspace.getActiveVoucherForUser(req.user.sub);
    return { voucher: v };
  }

  @Post('voucher/claim')
  async claimVoucher(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { code?: string; productId?: string },
  ) {
    return this.workspace.claimVoucherForUser({
      userId: req.user.sub,
      code: String(body?.code ?? ''),
      productId: body?.productId ? String(body.productId) : undefined,
    });
  }

  @Patch('profile')
  async patchProfile(
    @Req() req: { user: JwtUserPayload },
    @Body()
    body: {
      fullName?: string;
      email?: string;
      image?: string | null;
      phone?: string;
    },
  ) {
    return this.workspace.updateMyProfile(req.user.sub, {
      fullName: body?.fullName,
      email: body?.email,
      image: body?.image,
      phone: body?.phone,
    });
  }

  @Post('active-role')
  async switchActiveRole(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { role?: string },
  ) {
    const result = await this.workspace.issueRoleSwitchToken({
      userId: req.user.sub,
      targetRole: String(body?.role ?? ''),
    });
    const token = this.auth.signAccessToken(
      req.user.sub,
      req.user.email,
      result.role,
    );
    return { ok: true, role: result.role, token };
  }

  @Post('account/deletion-request')
  async requestAccountDeletion(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { reason?: string },
  ) {
    return this.workspace.requestAccountDeletion(
      req.user.sub,
      req.user.role,
      String(body?.reason ?? ''),
    );
  }

  @Get('account/deletion-status')
  async deletionStatus(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.getMyDeletionStatus(req.user.sub);
  }

  @Delete('account')
  async deleteMyAccount(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.deleteMyAccount(req.user.sub, req.user.role);
  }
}
