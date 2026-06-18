import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard],
})
export class DashboardModule {}
