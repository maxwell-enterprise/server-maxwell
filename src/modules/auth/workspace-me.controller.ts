import {
  Controller,
  Get,
  NotFoundException,
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
}
