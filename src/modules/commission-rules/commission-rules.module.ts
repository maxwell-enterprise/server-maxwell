import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommissionRulesController],
  providers: [CommissionRulesService],
})
export class CommissionRulesModule {}
