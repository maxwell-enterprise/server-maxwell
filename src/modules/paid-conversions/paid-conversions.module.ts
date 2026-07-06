import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { PaidConversionsController } from './paid-conversions.controller';
import { PaidConversionsService } from './paid-conversions.service';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule],
  controllers: [PaidConversionsController],
  providers: [PaidConversionsService],
  exports: [PaidConversionsService],
})
export class PaidConversionsModule {}
