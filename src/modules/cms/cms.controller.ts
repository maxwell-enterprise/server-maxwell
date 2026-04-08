import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CmsService } from './cms.service';

/** FE calls `/fe/content/posts` (global prefix `fe`). */
@Controller('content/posts')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  list() {
    return this.cms.list();
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.cms.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.cms.update(decodeURIComponent(id), body ?? {});
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.cms.remove(decodeURIComponent(id));
    return { ok: true };
  }
}
