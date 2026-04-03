import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  create(
    @Body(new ZodValidationPipe(CreateCertificationRuleDtoSchema))
    dto: CreateCertificationRuleDto,
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCertificationRuleDtoSchema))
    dto: UpdateCertificationRuleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
