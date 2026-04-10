import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertMarketingOrSuperAdmin } from '../../common/security/access-policy';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOrSuperAdmin(req.user, 'Campaign creation');
    return this.campaigns.create(body ?? {});
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOrSuperAdmin(req.user, 'Campaign update');
    return this.campaigns.update(decodeURIComponent(id), body ?? {});
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertMarketingOrSuperAdmin(req.user, 'Campaign deletion');
    await this.campaigns.remove(decodeURIComponent(id));
    return { ok: true };
  }

  @Post('track-click')
  @RateLimit({ limit: 120, windowMs: 60_000, keyBy: 'sourceCode' })
  trackClick(
    @Body() body: { sourceCode?: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.campaigns.trackClick(String(body?.sourceCode ?? ''), {
      ip,
      userAgent,
    });
  }

  @Post('track-conversion')
  @RateLimit({ limit: 40, windowMs: 60_000, keyBy: 'sourceCode' })
  trackConversion(@Body() body: { sourceCode?: string; amount?: number }) {
    return this.campaigns.trackConversion(
      String(body?.sourceCode ?? ''),
      Number(body?.amount),
    );
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard)
  bulk(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { mode?: string; items?: Record<string, unknown>[] },
  ) {
    assertMarketingOrSuperAdmin(req.user, 'Campaign bulk update');
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.campaigns.bulkUpsert(items);
  }
}
