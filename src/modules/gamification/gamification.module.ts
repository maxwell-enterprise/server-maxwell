import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [GamificationController],
  providers: [GamificationService, JwtAuthGuard],
})
export class GamificationModule {}
