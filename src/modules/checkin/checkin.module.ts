/**
 * MAXWELL ERP - Check-in Module
 */

import { Module } from '@nestjs/common';
import { CheckinRuntimeService } from './checkin.runtime.service';
import { CheckinController } from './checkin.controller';

@Module({
  controllers: [CheckinController],
  providers: [CheckinRuntimeService],
  exports: [CheckinRuntimeService],
})
export class CheckinModule {}
