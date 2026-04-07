import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CommissionRulesService } from './commission-rules.service';

@Controller('commission-rules')
export class CommissionRulesController {
  constructor(private readonly commissionRules: CommissionRulesService) {}

  @Get()
  list() {
    return this.commissionRules.list();
  }

  @Put(':id')
  upsert(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.commissionRules.upsert(decodeURIComponent(id), body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commissionRules.remove(decodeURIComponent(id));
  }
}
