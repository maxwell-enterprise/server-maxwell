import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GamificationController],
  providers: [GamificationService],
})
export class GamificationModule {}
