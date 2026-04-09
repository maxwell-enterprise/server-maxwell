import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { YouthImpactController } from './youth-impact.controller';
import { YouthImpactService } from './youth-impact.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [YouthImpactController],
  providers: [YouthImpactService, JwtAuthGuard],
})
export class YouthImpactModule {}
