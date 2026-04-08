import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { SystemAdminController } from './system-admin.controller';
import { SystemAdminService } from './system-admin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SystemAdminController],
  providers: [SystemAdminService],
  exports: [SystemAdminService],
})
export class SystemAdminModule {}
