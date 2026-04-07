import { Module } from '@nestjs/common';
import { MasterTiersService } from './master-tiers.service';
import { MasterTiersController } from './master-tiers.controller';

@Module({
  controllers: [MasterTiersController],
  providers: [MasterTiersService],
})
export class MasterTiersModule {}
