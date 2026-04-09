import { Module } from '@nestjs/common';
import { CertificationRulesController } from './certification-rules.controller';
import { CertificationRulesService } from './certification-rules.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [CertificationRulesController],
  providers: [CertificationRulesService, JwtAuthGuard],
  exports: [CertificationRulesService],
})
export class CertificationRulesModule {}
