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
import { YouthImpactService } from './youth-impact.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('youth-impact')
export class YouthImpactController {
  constructor(private readonly youthImpact: YouthImpactService) {}

  @Get('metrics')
  listMetrics() {
    return this.youthImpact.list();
  }

  @Get('metrics/:id')
  getMetric(@Param('id') id: string) {
    return this.youthImpact.getById(decodeURIComponent(id));
  }

  @Put('metrics/:id')
  @UseGuards(JwtAuthGuard)
  upsertMetric(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Youth impact metric update');
    return this.youthImpact.upsert(decodeURIComponent(id), body ?? {});
  }

  @Delete('metrics/:id')
  @UseGuards(JwtAuthGuard)
  deleteMetric(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOnly(req.user, 'Youth impact metric deletion');
    return this.youthImpact.delete(decodeURIComponent(id));
  }
}
