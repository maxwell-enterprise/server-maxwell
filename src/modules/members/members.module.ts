import { Module, forwardRef } from '@nestjs/common';
import { MembersController } from './members.controller';
import { InternalMembersController } from './internal-members.controller';
import { MembersService } from './members.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MembersController, InternalMembersController],
  providers: [MembersService, JwtAuthGuard],
  exports: [MembersService],
})
export class MembersModule {}
