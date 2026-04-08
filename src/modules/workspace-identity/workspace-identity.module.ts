import { Module } from '@nestjs/common';
import { WorkspaceIdentityService } from './workspace-identity.service';

@Module({
  providers: [WorkspaceIdentityService],
  exports: [WorkspaceIdentityService],
})
export class WorkspaceIdentityModule {}
