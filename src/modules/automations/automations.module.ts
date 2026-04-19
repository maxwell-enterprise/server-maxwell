import { Module } from '@nestjs/common';
import { AutomationsController } from './automations.controller';
import { AutomationsEmitService } from './automations-emit.service';
import { AutomationQueueWorkerService } from './automation-queue-worker.service';
import { SystemAdminModule } from '../system-admin/system-admin.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [SystemAdminModule, AuthModule, CommunicationModule],
  controllers: [AutomationsController],
  providers: [AutomationsEmitService, AutomationQueueWorkerService],
})
export class AutomationsModule {}
