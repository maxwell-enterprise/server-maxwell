import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';

@Module({
  imports: [AppConfigModule],
  controllers: [ScoutController],
  providers: [ScoutService],
})
export class ScoutModule {}
