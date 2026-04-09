import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommissionRulesService } from './commission-rules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertFinanceControllerOnly } from '../../common/security/access-policy';

@Controller('commission-rules')
export class CommissionRulesController {
  constructor(private readonly commissionRules: CommissionRulesService) {}

  @Get()
  list() {
    return this.commissionRules.list();
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  upsert(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertFinanceControllerOnly(req.user, 'Commission rule update');
    return this.commissionRules.upsert(decodeURIComponent(id), body ?? {});
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertFinanceControllerOnly(req.user, 'Commission rule deletion');
    return this.commissionRules.remove(decodeURIComponent(id));
  }
}
