import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SystemAdminService } from './system-admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertAutomationQueueAccess,
  assertSuperAdminOnly,
} from '../../common/security/access-policy';

/**
 * System admin: Automations, Security logs, Database meta, AI usage, Maintenance.
 * Maps to tables in `db.sql` (automation_queue, system_security_logs, ai_usage_logs, etc.).
 */
@Controller('system')
@UseGuards(JwtAuthGuard)
export class SystemAdminController {
  constructor(private readonly systemAdmin: SystemAdminService) {}

  private assertSystemAdmin(req: { user: JwtUserPayload }): void {
    assertSuperAdminOnly(req.user);
  }

  // --- Automations ---
  @Get('automations/queue')
  listAutomationQueue(@Req() req: { user: JwtUserPayload }) {
    assertAutomationQueueAccess(req.user, 'List automation queue');
    return this.systemAdmin.listAutomationQueue();
  }

  @Put('automations/queue/:id')
  async upsertAutomationQueue(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertAutomationQueueAccess(req.user, 'Update automation queue item');
    await this.systemAdmin.upsertAutomationQueueItem(
      decodeURIComponent(id),
      body,
    );
    return { ok: true };
  }

  @Get('automations/background-jobs')
  listBackgroundJobs(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listBackgroundJobs();
  }

  @Post('automations/background-jobs')
  insertBackgroundJob(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.insertBackgroundJob({
      id: body.id != null ? String(body.id) : undefined,
      type: String(body.type ?? ''),
      payload: body.payload,
      status: body.status != null ? String(body.status) : undefined,
    });
  }

  /** Trigger catalog for admin UI (Postgres `automation_trigger_definitions`). */
  @Get('automation-triggers')
  listAutomationTriggers(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listAutomationTriggers();
  }

  // --- Security ---
  @Get('security/logs')
  listSecurityLogs(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listSecurityLogs();
  }

  @Post('security/logs')
  appendSecurityLog(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.appendSecurityLog({
      actor: String(body.actor ?? ''),
      action: String(body.action ?? ''),
      details: body.details != null ? String(body.details) : undefined,
    });
  }

  @Get('security/roles')
  listSecurityRoles(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listSecurityRoles();
  }

  @Put('security/roles/:id')
  upsertSecurityRole(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.upsertSecurityRole(decodeURIComponent(id), body);
  }

  // --- Database (meta + schema AI history) ---
  @Get('database/tables')
  listPublicTables(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listPublicTablesMeta();
  }

  @Get('database/table-definitions')
  listTableDefinitions(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listDatabaseTableDefinitions();
  }

  @Get('database/tables/:name/rows')
  listTableRows(
    @Req() req: { user: JwtUserPayload },
    @Param('name') name: string,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listDatabaseTableRows(decodeURIComponent(name));
  }

  /** Truncated active queries (debug). */
  @Get('database/activity')
  listPgActivity(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listPgActivity();
  }

  @Get('database/schema-optimizations')
  listSchemaOptimizations(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listSchemaOptimizations();
  }

  @Post('database/schema-optimizations')
  saveSchemaOptimization(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.saveSchemaOptimization(body);
  }

  // --- AI usage ---
  @Get('ai-usage/logs')
  listAiUsageLogs(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.listAiUsageLogs();
  }

  @Post('ai-usage/logs')
  insertAiUsageLog(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.insertAiUsageLog(body);
  }

  // --- Maintenance ---
  @Get('maintenance/status')
  maintenanceStatus(@Req() req: { user: JwtUserPayload }) {
    this.assertSystemAdmin(req);
    return this.systemAdmin.getMaintenanceStatus();
  }
}
