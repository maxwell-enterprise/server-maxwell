import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { SystemAdminController } from './system-admin.controller';
import { SystemAdminService } from './system-admin.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SystemAdminController],
  providers: [SystemAdminService, JwtAuthGuard],
  exports: [SystemAdminService],
})
export class SystemAdminModule {}
