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
import { WorkspaceIdentityService } from '../workspace-identity/workspace-identity.service';
import type { JwtUserPayload } from './auth.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class WorkspaceMeController {
  constructor(private readonly workspace: WorkspaceIdentityService) {}

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
    @Body() body: { fullName?: string; email?: string; image?: string | null },
  ) {
    return this.workspace.updateMyProfile(req.user.sub, {
      fullName: body?.fullName,
      email: body?.email,
      image: body?.image,
    });
  }

  @Delete('account')
  async deleteMyAccount(@Req() req: { user: JwtUserPayload }) {
    return this.workspace.deleteMyAccount(req.user.sub, req.user.role);
  }
}
