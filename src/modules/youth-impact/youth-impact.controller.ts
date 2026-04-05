import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { YouthImpactService } from './youth-impact.service';

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
  upsertMetric(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.youthImpact.upsert(decodeURIComponent(id), body ?? {});
  }

  @Delete('metrics/:id')
  deleteMetric(@Param('id') id: string) {
    return this.youthImpact.delete(decodeURIComponent(id));
  }
}
