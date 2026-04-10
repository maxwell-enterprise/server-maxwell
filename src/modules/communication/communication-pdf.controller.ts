import {
  Body,
  Controller,
  Get,
  Put,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommunicationPdfService } from './communication-pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertMarketingOnly } from '../../common/security/access-policy';

@Controller('communication/pdf')
export class CommunicationPdfController {
  constructor(private readonly pdf: CommunicationPdfService) {}

  @Get('templates')
  listTemplates() {
    return this.pdf.listTemplates();
  }

  @Put('templates/:id')
  @UseGuards(JwtAuthGuard)
  saveTemplate(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'PDF template update');
    const merged = { ...(body ?? {}), id: decodeURIComponent(id) };
    return this.pdf.upsertTemplate(merged);
  }
}
