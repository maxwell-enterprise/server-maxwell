import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommunicationEmailService } from './communication-email.service';

@Controller('communication/email')
export class CommunicationEmailController {
  constructor(private readonly email: CommunicationEmailService) {}

  @Get('templates')
  listTemplates() {
    return this.email.listTemplates();
  }

  @Get('campaigns')
  listCampaigns() {
    return this.email.listCampaigns();
  }

  @Post('campaigns')
  createCampaign(@Body() body: Record<string, unknown>) {
    return this.email.createCampaign(body ?? {});
  }

  @Get('logs')
  listLogs() {
    return this.email.listLogs();
  }

  @Post('logs')
  createLog(@Body() body: Record<string, unknown>) {
    return this.email.createLog(body ?? {});
  }
}
