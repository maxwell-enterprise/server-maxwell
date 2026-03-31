import { Controller, Get, Header } from '@nestjs/common';

/**
 * Served at `/` (outside the `fe` global prefix) so you can open the Railway URL
 * in a browser and immediately see that the deployment is live.
 */
@Controller()
export class RootController {
  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getRoot(): string {
    return [
      'Maxwell API — online.',
      'REST API: prefix /fe (contoh: GET /fe/health)',
      '',
    ].join('\n');
  }
}
