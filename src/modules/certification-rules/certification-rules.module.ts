import { Module } from '@nestjs/common';
import { CertificationRulesController } from './certification-rules.controller';
import { CertificationRulesService } from './certification-rules.service';

@Module({
  controllers: [CertificationRulesController],
  providers: [CertificationRulesService],
  exports: [CertificationRulesService],
})
export class CertificationRulesModule {}
