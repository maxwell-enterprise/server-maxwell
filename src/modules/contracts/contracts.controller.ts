import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import {
  BulkClausesDtoSchema,
  ClauseItemDto,
  ContractInstanceDocSchema,
  ContractTemplateDocSchema,
  PatchContractInstanceDto,
  PatchContractInstanceSchema,
} from './dto/contracts.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get('clauses')
  listClauses() {
    return this.service.findAllClauses();
  }

  @Post('clauses/bulk')
  bulkUpsertClauses(
    @Body(new ZodValidationPipe(BulkClausesDtoSchema))
    body: {
      items: ClauseItemDto[];
    },
  ) {
    return this.service.upsertClauseItems(body.items);
  }

  @Get('templates')
  listTemplates() {
    return this.service.findAllTemplates();
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    const doc = await this.service.findTemplateById(id);
    if (!doc) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return doc;
  }

  @Put('templates/:id')
  upsertTemplate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ContractTemplateDocSchema))
    body: Record<string, unknown>,
  ) {
    const merged = body.id === id ? body : { ...body, id };
    return this.service.upsertTemplate(merged);
  }

  @Get('instances')
  listInstances(@Query('memberId') memberId?: string) {
    return this.service.findAllInstances(memberId);
  }

  @Post('instances')
  createInstance(
    @Body(new ZodValidationPipe(ContractInstanceDocSchema))
    body: Record<string, unknown>,
  ) {
    return this.service.upsertInstance(body);
  }

  @Patch('instances/:id')
  patchInstance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PatchContractInstanceSchema))
    body: PatchContractInstanceDto,
  ) {
    return this.service.patchInstance(id, body);
  }
}
