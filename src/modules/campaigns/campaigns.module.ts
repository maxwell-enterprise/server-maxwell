import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, JwtAuthGuard],
})
export class CampaignsModule {}
