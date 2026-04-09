import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { StoreSupportController } from './store-support.controller';
import { StoreSupportService } from './store-support.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StoreSupportController],
  providers: [StoreSupportService, JwtAuthGuard],
})
export class StoreSupportModule {}
