/**
 * MAXWELL ERP - Events Module
 */

import { Module } from '@nestjs/common';
import { EventsRuntimeService } from './events.runtime.service';
import { EventsController, AccessTagsController } from './events.controller';

@Module({
  controllers: [EventsController, AccessTagsController],
  providers: [EventsRuntimeService],
  exports: [EventsRuntimeService],
})
export class EventsModule {}
