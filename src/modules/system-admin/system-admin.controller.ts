import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { SystemAdminService } from './system-admin.service';

/**
 * System admin: Automations, Security logs, Database meta, AI usage, Maintenance.
 * Maps to tables in `db.sql` (automation_queue, system_security_logs, ai_usage_logs, etc.).
 */
@Controller('system')
export class SystemAdminController {
  constructor(private readonly systemAdmin: SystemAdminService) {}

  // --- Automations ---
  @Get('automations/queue')
  listAutomationQueue() {
    return this.systemAdmin.listAutomationQueue();
  }

  @Put('automations/queue/:id')
  async upsertAutomationQueue(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.systemAdmin.upsertAutomationQueueItem(
      decodeURIComponent(id),
      body,
    );
    return { ok: true };
  }

  @Get('automations/background-jobs')
  listBackgroundJobs() {
    return this.systemAdmin.listBackgroundJobs();
  }

  @Post('automations/background-jobs')
  insertBackgroundJob(@Body() body: Record<string, unknown>) {
    return this.systemAdmin.insertBackgroundJob({
      id: body.id != null ? String(body.id) : undefined,
      type: String(body.type ?? ''),
      payload: body.payload,
      status: body.status != null ? String(body.status) : undefined,
    });
  }

  /** Trigger catalog for admin UI (Postgres `automation_trigger_definitions`). */
  @Get('automation-triggers')
  listAutomationTriggers() {
    return this.systemAdmin.listAutomationTriggers();
  }

  // --- Security ---
  @Get('security/logs')
  listSecurityLogs() {
    return this.systemAdmin.listSecurityLogs();
  }

  @Post('security/logs')
  appendSecurityLog(@Body() body: Record<string, unknown>) {
    return this.systemAdmin.appendSecurityLog({
      actor: String(body.actor ?? ''),
      action: String(body.action ?? ''),
      details: body.details != null ? String(body.details) : undefined,
    });
  }

  @Get('security/roles')
  listSecurityRoles() {
    return this.systemAdmin.listSecurityRoles();
  }

  @Put('security/roles/:id')
  upsertSecurityRole(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.systemAdmin.upsertSecurityRole(decodeURIComponent(id), body);
  }

  // --- Database (meta + schema AI history) ---
  @Get('database/tables')
  listPublicTables() {
    return this.systemAdmin.listPublicTablesMeta();
  }

  @Get('database/table-definitions')
  listTableDefinitions() {
    return this.systemAdmin.listDatabaseTableDefinitions();
  }

  @Get('database/tables/:name/rows')
  listTableRows(@Param('name') name: string) {
    return this.systemAdmin.listDatabaseTableRows(decodeURIComponent(name));
  }

  /** Truncated active queries (debug). */
  @Get('database/activity')
  listPgActivity() {
    return this.systemAdmin.listPgActivity();
  }

  @Get('database/schema-optimizations')
  listSchemaOptimizations() {
    return this.systemAdmin.listSchemaOptimizations();
  }

  @Post('database/schema-optimizations')
  saveSchemaOptimization(@Body() body: Record<string, unknown>) {
    return this.systemAdmin.saveSchemaOptimization(body);
  }

  // --- AI usage ---
  @Get('ai-usage/logs')
  listAiUsageLogs() {
    return this.systemAdmin.listAiUsageLogs();
  }

  @Post('ai-usage/logs')
  insertAiUsageLog(@Body() body: Record<string, unknown>) {
    return this.systemAdmin.insertAiUsageLog(body);
  }

  // --- Maintenance ---
  @Get('maintenance/status')
  maintenanceStatus() {
    return this.systemAdmin.getMaintenanceStatus();
  }
}
