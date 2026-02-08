/**
 * MAXWELL ERP - Check-in Module
 */

import { Module } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';
// import { WalletModule } from '../wallet/wallet.module';
// import { EventsModule } from '../events/events.module';

@Module({
  // imports: [WalletModule, EventsModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
