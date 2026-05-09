import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AutomationsModule } from '../automations/automations.module';

@Module({
  imports: [AuthModule, AutomationsModule],
  controllers: [ContractsController],
  providers: [ContractsService, JwtAuthGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
