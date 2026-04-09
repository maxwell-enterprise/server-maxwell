import { Module } from '@nestjs/common';
import { MasterTiersService } from './master-tiers.service';
import { MasterTiersController } from './master-tiers.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [MasterTiersController],
  providers: [MasterTiersService, JwtAuthGuard],
})
export class MasterTiersModule {}
