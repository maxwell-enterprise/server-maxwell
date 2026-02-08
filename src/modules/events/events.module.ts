/**
 * MAXWELL ERP - Events Module
 */

import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController, AccessTagsController } from './events.controller';

@Module({
  controllers: [EventsController, AccessTagsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
