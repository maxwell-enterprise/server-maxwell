/**
 * MAXWELL ERP - Events Module
 */

import { Module } from '@nestjs/common';
import { EventsRuntimeService } from './events.runtime.service';
import { EventsController, AccessTagsController } from './events.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [EventsController, AccessTagsController],
  providers: [EventsRuntimeService, JwtAuthGuard],
  exports: [EventsRuntimeService],
})
export class EventsModule {}
