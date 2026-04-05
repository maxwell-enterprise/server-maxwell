import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { StoreSupportController } from './store-support.controller';
import { StoreSupportService } from './store-support.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StoreSupportController],
  providers: [StoreSupportService],
})
export class StoreSupportModule {}
