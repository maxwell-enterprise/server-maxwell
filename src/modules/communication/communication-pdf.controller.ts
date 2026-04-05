import { Body, Controller, Get, Put, Param } from '@nestjs/common';
import { CommunicationPdfService } from './communication-pdf.service';

@Controller('communication/pdf')
export class CommunicationPdfController {
  constructor(private readonly pdf: CommunicationPdfService) {}

  @Get('templates')
  listTemplates() {
    return this.pdf.listTemplates();
  }

  @Put('templates/:id')
  saveTemplate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const merged = { ...(body ?? {}), id: decodeURIComponent(id) };
    return this.pdf.upsertTemplate(merged);
  }
}
