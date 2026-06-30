import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  EventCampaignsController,
  EventCampaignsMeController,
} from './event-campaigns.controller';
import { EventCampaignsService } from './event-campaigns.service';

@Module({
  imports: [DatabaseModule, AuthModule, PrismaModule],
  controllers: [EventCampaignsController, EventCampaignsMeController],
  providers: [EventCampaignsService],
  exports: [EventCampaignsService],
})
export class EventCampaignsModule {}
