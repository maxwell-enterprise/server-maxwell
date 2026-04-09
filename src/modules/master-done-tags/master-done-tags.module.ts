import { Module } from '@nestjs/common';
import { MasterDoneTagsController } from './master-done-tags.controller';
import { MasterDoneTagsService } from './master-done-tags.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [MasterDoneTagsController],
  providers: [MasterDoneTagsService, JwtAuthGuard],
})
export class MasterDoneTagsModule {}
