import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { YouthImpactController } from './youth-impact.controller';
import { YouthImpactService } from './youth-impact.service';

@Module({
  imports: [DatabaseModule],
  controllers: [YouthImpactController],
  providers: [YouthImpactService],
})
export class YouthImpactModule {}
