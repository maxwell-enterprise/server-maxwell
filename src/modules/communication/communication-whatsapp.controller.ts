import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommunicationWhatsappService } from './communication-whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertMarketingOnly } from '../../common/security/access-policy';

@Controller('communication/whatsapp')
export class CommunicationWhatsappController {
  constructor(private readonly wa: CommunicationWhatsappService) {}

  @Get('queue')
  listQueue() {
    return this.wa.listQueue();
  }

  @Post('queue')
  @UseGuards(JwtAuthGuard)
  addTask(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'WhatsApp queue add');
    return this.wa.addTask(body ?? {});
  }

  @Put('queue')
  @UseGuards(JwtAuthGuard)
  updateTask(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'WhatsApp queue update');
    return this.wa.upsertTask(body ?? {});
  }

  @Delete('queue/:id')
  @UseGuards(JwtAuthGuard)
  deleteTask(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    assertMarketingOnly(req.user, 'WhatsApp queue deletion');
    return this.wa.deleteTask(decodeURIComponent(id));
  }

  @Get('templates')
  listTemplates() {
    return this.wa.listTemplates();
  }

  @Put('templates/:id')
  @UseGuards(JwtAuthGuard)
  saveTemplate(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertMarketingOnly(req.user, 'WhatsApp template update');
    const merged = { ...(body ?? {}), id: decodeURIComponent(id) };
    return this.wa.upsertTemplate(merged);
  }

  @Post('templates/reset')
  @UseGuards(JwtAuthGuard)
  resetTemplates(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { templates?: Record<string, unknown>[] },
  ) {
    assertMarketingOnly(req.user, 'WhatsApp template reset');
    const list = Array.isArray(body?.templates) ? body.templates : [];
    return this.wa.resetTemplates(list);
  }
}
