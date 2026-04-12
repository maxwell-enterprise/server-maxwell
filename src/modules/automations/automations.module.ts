import { Module } from '@nestjs/common';
import { AutomationsController } from './automations.controller';
import { AutomationsEmitService } from './automations-emit.service';
import { SystemAdminModule } from '../system-admin/system-admin.module';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [SystemAdminModule, AuthModule],
  controllers: [AutomationsController],
  providers: [AutomationsEmitService],
})
export class AutomationsModule {}
