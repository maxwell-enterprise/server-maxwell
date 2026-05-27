import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { DatabaseModule } from '../../common/database';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [ScoutController],
  providers: [ScoutService],
})
export class ScoutModule {}
