import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CmsService } from './cms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertCmsResourceAccess } from '../../common/security/access-policy';

/** FE calls `/fe/content/posts` (global prefix `fe`). */
@Controller('content/posts')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  list() {
    return this.cms.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertCmsResourceAccess(req.user, 'Content post creation');
    return this.cms.create(body ?? {});
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertCmsResourceAccess(req.user, 'Content post update');
    return this.cms.update(decodeURIComponent(id), body ?? {});
  }

  @Post('ai-generate')
  @UseGuards(JwtAuthGuard)
  generateAiContent(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    assertCmsResourceAccess(req.user, 'AI content generation');
    return this.cms.generateAiContent(body ?? {}, String(req.user.sub));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertCmsResourceAccess(req.user, 'Content post deletion');
    await this.cms.remove(decodeURIComponent(id));
    return { ok: true };
  }
}
