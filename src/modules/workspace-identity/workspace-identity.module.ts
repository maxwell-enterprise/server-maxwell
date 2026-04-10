import { Module } from '@nestjs/common';
import { AccountDeletionBroadcastService } from './account-deletion-broadcast.service';
import { WorkspaceIdentityService } from './workspace-identity.service';

@Module({
  providers: [AccountDeletionBroadcastService, WorkspaceIdentityService],
  exports: [WorkspaceIdentityService],
})
export class WorkspaceIdentityModule {}
