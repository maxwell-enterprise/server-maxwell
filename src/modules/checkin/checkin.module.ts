/**
 * MAXWELL ERP - Check-in Module
 */

import { Module } from '@nestjs/common';
import { CheckinRuntimeService } from './checkin.runtime.service';
import { CheckinController } from './checkin.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [CheckinController],
  providers: [CheckinRuntimeService, JwtAuthGuard],
  exports: [CheckinRuntimeService],
})
export class CheckinModule {}
