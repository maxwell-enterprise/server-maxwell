import { Module, forwardRef } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { AccountDeletionBroadcastService } from './account-deletion-broadcast.service';
import { WorkspaceIdentityService } from './workspace-identity.service';

@Module({
  imports: [forwardRef(() => MembersModule)],
  providers: [AccountDeletionBroadcastService, WorkspaceIdentityService],
  exports: [WorkspaceIdentityService],
})
export class WorkspaceIdentityModule {}
