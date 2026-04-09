import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [ContractsController],
  providers: [ContractsService, JwtAuthGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
