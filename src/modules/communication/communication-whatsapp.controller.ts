import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CommunicationWhatsappService } from './communication-whatsapp.service';

@Controller('communication/whatsapp')
export class CommunicationWhatsappController {
  constructor(private readonly wa: CommunicationWhatsappService) {}

  @Get('queue')
  listQueue() {
    return this.wa.listQueue();
  }

  @Post('queue')
  addTask(@Body() body: Record<string, unknown>) {
    return this.wa.addTask(body ?? {});
  }

  @Put('queue')
  updateTask(@Body() body: Record<string, unknown>) {
    return this.wa.upsertTask(body ?? {});
  }

  @Delete('queue/:id')
  deleteTask(@Param('id') id: string) {
    return this.wa.deleteTask(decodeURIComponent(id));
  }

  @Get('templates')
  listTemplates() {
    return this.wa.listTemplates();
  }

  @Put('templates/:id')
  saveTemplate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const merged = { ...(body ?? {}), id: decodeURIComponent(id) };
    return this.wa.upsertTemplate(merged);
  }

  @Post('templates/reset')
  resetTemplates(@Body() body: { templates?: Record<string, unknown>[] }) {
    const list = Array.isArray(body?.templates) ? body.templates : [];
    return this.wa.resetTemplates(list);
  }
}
