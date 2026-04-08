import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { InternalMembersController } from './internal-members.controller';
import { MembersService } from './members.service';

@Module({
  controllers: [MembersController, InternalMembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
