import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
