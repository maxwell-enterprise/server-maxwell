import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.campaigns.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.campaigns.update(decodeURIComponent(id), body ?? {});
  }

  @Post('track-click')
  @RateLimit({ limit: 120, windowMs: 60_000, keyBy: 'sourceCode' })
  trackClick(@Body() body: { sourceCode?: string }) {
    return this.campaigns.trackClick(String(body?.sourceCode ?? ''));
  }

  @Post('track-conversion')
  @RateLimit({ limit: 40, windowMs: 60_000, keyBy: 'sourceCode' })
  trackConversion(
    @Body() body: { sourceCode?: string; amount?: number },
  ) {
    return this.campaigns.trackConversion(
      String(body?.sourceCode ?? ''),
      Number(body?.amount),
    );
  }

  @Post('bulk')
  bulk(@Body() body: { mode?: string; items?: Record<string, unknown>[] }) {
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.campaigns.bulkUpsert(items);
  }
}
