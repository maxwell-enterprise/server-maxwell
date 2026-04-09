import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CertificationRulesService } from './certification-rules.service';
import {
  CreateCertificationRuleDto,
  CreateCertificationRuleDtoSchema,
  UpdateCertificationRuleDto,
  UpdateCertificationRuleDtoSchema,
  CertificationRuleQueryDto,
  CertificationRuleQueryDtoSchema,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('certification-rules')
export class CertificationRulesController {
  constructor(private readonly service: CertificationRulesService) {}

  @Get()
  findAll(
    @Query(new ZodValidationPipe(CertificationRuleQueryDtoSchema))
    query: CertificationRuleQueryDto,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateCertificationRuleDtoSchema))
    dto: CreateCertificationRuleDto,
  ) {
    assertOperationsOnly(req.user, 'Certification rule creation');
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCertificationRuleDtoSchema))
    dto: UpdateCertificationRuleDto,
  ) {
    assertOperationsOnly(req.user, 'Certification rule update');
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOnly(req.user, 'Certification rule deletion');
    return this.service.remove(id);
  }
}
