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
  Req,
  UseGuards,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get('clauses')
  listClauses() {
    return this.service.findAllClauses();
  }

  @Post('clauses/bulk')
  @UseGuards(JwtAuthGuard)
  bulkUpsertClauses(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(BulkClausesDtoSchema))
    body: {
      items: ClauseItemDto[];
    },
  ) {
    assertOperationsOnly(req.user, 'Contract clause bulk upsert');
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
  @UseGuards(JwtAuthGuard)
  upsertTemplate(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ContractTemplateDocSchema))
    body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Contract template upsert');
    const merged = body.id === id ? body : { ...body, id };
    return this.service.upsertTemplate(merged);
  }

  @Get('instances')
  listInstances(@Query('memberId') memberId?: string) {
    return this.service.findAllInstances(memberId);
  }

  @Post('instances')
  @UseGuards(JwtAuthGuard)
  createInstance(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(ContractInstanceDocSchema))
    body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Contract instance creation');
    return this.service.upsertInstance(body);
  }

  @Patch('instances/:id')
  @UseGuards(JwtAuthGuard)
  patchInstance(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PatchContractInstanceSchema))
    body: PatchContractInstanceDto,
  ) {
    assertOperationsOnly(req.user, 'Contract instance update');
    return this.service.patchInstance(id, body);
  }
}
