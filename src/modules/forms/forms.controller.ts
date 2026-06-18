import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOrSuperAdmin } from '../../common/security/access-policy';
import { RateLimit } from '../../common/security/rate-limit.decorator';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: { user: JwtUserPayload }) {
    assertOperationsOrSuperAdmin(req.user, 'Forms list');
    return this.forms.listForms();
  }

  @Get('my-responses')
  @UseGuards(JwtAuthGuard)
  myResponses(@Req() req: { user: JwtUserPayload }) {
    return this.forms.listMyResponses(req.user);
  }

  @Get('public/respond')
  getPublic(
    @Query('formId') formId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.forms.getPublicFormPayload(formId, sessionId);
  }

  @Post('public/respond')
  @RateLimit({ limit: 30, windowMs: 60_000, keyBy: 'ip' })
  @UseGuards(OptionalJwtAuthGuard)
  submitPublic(
    @Req() req: { user?: JwtUserPayload | null },
    @Body() body: Record<string, unknown>,
  ) {
    return this.forms.submitResponse(req.user ?? null, body);
  }

  @Get(':id/reports')
  @UseGuards(JwtAuthGuard)
  reports(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOrSuperAdmin(req.user, 'Form reports');
    return this.forms.getReports(decodeURIComponent(id));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOne(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOrSuperAdmin(req.user, 'Form detail');
    return this.forms.getForm(decodeURIComponent(id));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  upsert(@Req() req: { user: JwtUserPayload }, @Body() body: Record<string, unknown>) {
    assertOperationsOrSuperAdmin(req.user, 'Form upsert');
    return this.forms.upsertForm(req.user, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOrSuperAdmin(req.user, 'Form delete');
    await this.forms.deleteForm(decodeURIComponent(id));
    return { ok: true };
  }

  @Post(':id/deployments')
  @UseGuards(JwtAuthGuard)
  addDeployment(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertOperationsOrSuperAdmin(req.user, 'Form deployment');
    return this.forms.addDeployment(decodeURIComponent(id), body);
  }

  @Delete(':id/deployments/:deploymentId')
  @UseGuards(JwtAuthGuard)
  async removeDeployment(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Param('deploymentId') deploymentId: string,
  ) {
    assertOperationsOrSuperAdmin(req.user, 'Form deployment delete');
    await this.forms.deleteDeployment(
      decodeURIComponent(id),
      decodeURIComponent(deploymentId),
    );
    return { ok: true };
  }
}
