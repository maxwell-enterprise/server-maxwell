import { Module } from '@nestjs/common';
import { MasterDoneTagsController } from './master-done-tags.controller';
import { MasterDoneTagsService } from './master-done-tags.service';

@Module({
  controllers: [MasterDoneTagsController],
  providers: [MasterDoneTagsService],
})
export class MasterDoneTagsModule {}
