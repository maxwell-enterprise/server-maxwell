import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { StoreDevSeedController } from './store-dev-seed.controller';
import { StoreSupportController } from './store-support.controller';
import { StoreSupportService } from './store-support.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StoreSupportController, StoreDevSeedController],
  providers: [StoreSupportService],
})
export class StoreSupportModule {}
