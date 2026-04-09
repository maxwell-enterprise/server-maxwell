import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CommissionRulesController],
  providers: [CommissionRulesService, JwtAuthGuard],
})
export class CommissionRulesModule {}
