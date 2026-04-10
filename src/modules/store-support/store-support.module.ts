import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { StoreSupportController } from './store-support.controller';
import { StoreSupportService } from './store-support.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule],
  controllers: [StoreSupportController],
  providers: [StoreSupportService, JwtAuthGuard],
})
export class StoreSupportModule {}
