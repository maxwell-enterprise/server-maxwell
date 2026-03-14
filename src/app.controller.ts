import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo() {
    return this.appService.getAppInfo();
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('readiness')
  getReadiness() {
    return this.appService.getReadiness();
  }
}
