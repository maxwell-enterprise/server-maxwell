import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AUTOMATION_TRIGGER_SEED } from './automation-triggers.seed';

/** FE SecurityAuditLog shape */
export interface SecurityAuditLogDto {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

export interface AutomationQueueItemDto {
  id: string;
  triggerType: string;
  contextData: unknown;
  status: string;
  createdAt: string;
  processedAt?: string;
  errorLog?: string;
  description: string;
}

export interface BackgroundJobDto {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  timestamp: string;
}

export interface AiUsageLogDto {
  id: string;
  timestamp: string;
  userId: string;
  featureName: string;
  model: string;
  prompt: string;
  response: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD: number;
  costIDR: number;
}

export interface SchemaOptimizationDto {
  id: string;
  version: number;
  timestamp: string;
  summary: string;
  result: unknown;
}

export interface PublicTableMeta {
  name: string;
  rowEstimate: number;
}

export interface SecurityRoleDto {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  policies: Record<string, unknown>;
  isSystemRole: boolean;
  sodViolations: string[];
}

export interface DatabaseTableColumnDto {
  name: string;
  type: string;
  isPk: boolean;
  isFk: boolean;
  fkTarget?: string;
  isMandatory: boolean;
}

export interface DatabaseTableDefinitionDto {
  tableName: string;
  rowCount: number;
  columns: DatabaseTableColumnDto[];
}

/** Subset of pg_stat_activity for admin debugging (not full query text). */
export interface PgActivityRow {
  pid: number;
  usename: string | null;
  applicationName: string | null;
  clientAddr: string | null;
  state: string | null;
  waitEventType: string | null;
  secondsRunning: number | null;
  querySnippet: string;
}

/** Row for admin trigger picker — backed by `automation_trigger_definitions`. */
export interface AutomationTriggerDto {
  id: string;
  label: string;
  description: string;
  category: string;
  iconName: string;
  variables: unknown;
}

@Injectable()
export class SystemAdminService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAutomationTriggersSeeded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[SystemAdmin] automation_trigger_definitions seed skipped (run migration 024?): ${msg}`,
      );
    }
  }

  private async ensureAutomationTriggersSeeded(): Promise<void> {
    const cnt = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM automation_trigger_definitions`,
    );
    const n = parseInt(cnt.rows[0]?.c ?? '0', 10) || 0;
    if (n > 0) return;

    for (const row of AUTOMATION_TRIGGER_SEED) {
      await this.db.query(
        `INSERT INTO automation_trigger_definitions
          (id, label, description, category, icon_name, variables, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.label,
          row.description,
          row.category,
          row.iconName,
          JSON.stringify(row.variables),
          row.sortOrder,
        ],
      );
    }
  }

  async listAutomationTriggers(): Promise<AutomationTriggerDto[]> {
    const res = await this.db.query<{
      id: string;
      label: string;
      description: string;
      category: string;
      icon_name: string;
      variables: unknown;
    }>(
      `SELECT id, label, description, category, icon_name, variables
       FROM automation_trigger_definitions
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      label: r.label,
      description: r.description,
      category: r.category,
      iconName: r.icon_name,
      variables: r.variables,
    }));
  }

  // --- Security logs (system_security_logs) ---

  async listSecurityLogs(): Promise<SecurityAuditLogDto[]> {
    const res = await this.db.query<{
      id: string;
      userId: string | null;
      action: string;
      context: unknown;
      timestamp: Date;
    }>(
      `SELECT id::text, "userId", action, context, timestamp
       FROM system_security_logs
       ORDER BY timestamp DESC
       LIMIT 500`,
    );
    return res.rows.map((r) => this.rowToSecurityLog(r));
  }

  // --- Security roles (auth_roles) ---

  async listSecurityRoles(): Promise<SecurityRoleDto[]> {
    const res = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      permissions: unknown;
    }>(
      `SELECT id, name, description, permissions
       FROM auth_roles
       ORDER BY id ASC`,
    );
    return res.rows.map((row) => this.rowToSecurityRole(row));
  }

  async upsertSecurityRole(
    id: string,
    body: Record<string, unknown>,
  ): Promise<SecurityRoleDto> {
    const payload = this.normalizeSecurityRolePayload(id, body);
    await this.db.query(
      `INSERT INTO auth_roles (id, name, description, permissions, "createdAt")
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         permissions = EXCLUDED.permissions`,
      [
        payload.id,
        payload.name,
        payload.description,
        JSON.stringify({
          permissions: payload.permissions,
          policies: payload.policies,
          isSystemRole: payload.isSystemRole,
          sodViolations: payload.sodViolations,
        }),
      ],
    );
    return payload;
  }

  private rowToSecurityRole(row: {
    id: string;
    name: string;
    description: string | null;
    permissions: unknown;
  }): SecurityRoleDto {
    let permissions: string[] = [];
    let policies: Record<string, unknown> = {};
    let isSystemRole = row.id.startsWith('ROLE_');
    let sodViolations: string[] = [];

    if (Array.isArray(row.permissions)) {
      permissions = row.permissions
        .map((p) => String(p))
        .filter((p) => p.trim().length > 0);
    } else if (
      row.permissions &&
      typeof row.permissions === 'object' &&
      row.permissions !== null
    ) {
      const asObj = row.permissions as Record<string, unknown>;
      const list = asObj.permissions;
      if (Array.isArray(list)) {
        permissions = list
          .map((p) => String(p))
          .filter((p) => p.trim().length > 0);
      }
      if (asObj.policies && typeof asObj.policies === 'object') {
        policies = asObj.policies as Record<string, unknown>;
      }
      if (typeof asObj.isSystemRole === 'boolean') {
        isSystemRole = asObj.isSystemRole;
      }
      if (Array.isArray(asObj.sodViolations)) {
        sodViolations = asObj.sodViolations.map((v) => String(v));
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      permissions,
      policies,
      isSystemRole,
      sodViolations,
    };
  }

  private normalizeSecurityRolePayload(
    id: string,
    body: Record<string, unknown>,
  ): SecurityRoleDto {
    const roleId = String(id ?? '').trim();
    const name = String(body.name ?? '').trim();
    if (!roleId || !name) {
      throw new BadRequestException('id and name are required');
    }

    const permissionList = Array.isArray(body.permissions)
      ? body.permissions.map((p) => String(p)).filter(Boolean)
      : [];
    const policies =
      body.policies && typeof body.policies === 'object'
        ? (body.policies as Record<string, unknown>)
        : {};
    const sodViolations = Array.isArray(body.sodViolations)
      ? body.sodViolations.map((v) => String(v))
      : [];
    const isSystemRole =
      typeof body.isSystemRole === 'boolean'
        ? body.isSystemRole
        : roleId.startsWith('ROLE_');

    return {
      id: roleId,
      name,
      description: String(body.description ?? ''),
      permissions: permissionList,
      policies,
      isSystemRole,
      sodViolations,
    };
  }

  async appendSecurityLog(body: {
    actor: string;
    action: string;
    details?: string;
  }): Promise<SecurityAuditLogDto> {
    const actor = String(body.actor ?? '');
    const action = String(body.action ?? '');
    if (!actor.trim() || !action.trim()) {
      throw new BadRequestException('actor and action are required');
    }
    const details = String(body.details ?? '');
    const ins = await this.db.query<{
      id: string;
      userId: string | null;
      action: string;
      context: unknown;
      timestamp: Date;
    }>(
      `INSERT INTO system_security_logs (id, "userId", action, context)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb)
       RETURNING id::text, "userId", action, context, timestamp`,
      [actor, action, JSON.stringify({ details })],
    );
    const row = ins.rows[0];
    if (!row) throw new BadRequestException('Insert failed');
    return this.rowToSecurityLog(row);
  }

  private rowToSecurityLog(r: {
    id: string;
    userId: string | null;
    action: string;
    context: unknown;
    timestamp: Date;
  }): SecurityAuditLogDto {
    let details = '';
    if (r.context && typeof r.context === 'object' && r.context !== null) {
      const c = r.context as Record<string, unknown>;
      if (typeof c.details === 'string') details = c.details;
      else details = JSON.stringify(r.context);
    } else if (typeof r.context === 'string') {
      details = r.context;
    }
    return {
      id: r.id,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
      actor: r.userId ?? '',
      action: r.action,
      details,
    };
  }

  // --- Automation queue (automation_queue) ---

  async listAutomationQueue(): Promise<AutomationQueueItemDto[]> {
    const res = await this.db.query<{
      id: string;
      triggerType: string;
      contextData: unknown;
      status: string;
      createdAt: Date;
      processedAt: Date | null;
      errorLog: string | null;
      description: string;
    }>(
      `SELECT id, "triggerType", "contextData", status, "createdAt", "processedAt", "errorLog", description
       FROM automation_queue
       ORDER BY "createdAt" DESC
       LIMIT 500`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      triggerType: r.triggerType,
      contextData: r.contextData,
      status: r.status,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      processedAt: r.processedAt
        ? r.processedAt instanceof Date
          ? r.processedAt.toISOString()
          : String(r.processedAt)
        : undefined,
      errorLog: r.errorLog ?? undefined,
      description: r.description,
    }));
  }

  async upsertAutomationQueueItem(
    id: string,
    body: Partial<AutomationQueueItemDto>,
  ): Promise<void> {
    const triggerType = String(body.triggerType ?? '');
    const description = String(body.description ?? '');
    if (!triggerType || !description) {
      throw new BadRequestException('triggerType and description are required');
    }
    const contextData = body.contextData ?? {};
    const status = String(body.status ?? 'PENDING');
    const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();
    await this.db.query(
      `INSERT INTO automation_queue (id, "triggerType", "contextData", status, "createdAt", "processedAt", "errorLog", description)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         "triggerType" = EXCLUDED."triggerType",
         "contextData" = EXCLUDED."contextData",
         status = EXCLUDED.status,
         "processedAt" = EXCLUDED."processedAt",
         "errorLog" = EXCLUDED."errorLog",
         description = EXCLUDED.description`,
      [
        id,
        triggerType,
        JSON.stringify(contextData),
        status,
        createdAt,
        body.processedAt ? new Date(body.processedAt) : null,
        body.errorLog ?? null,
        description,
      ],
    );
  }

  // --- Background jobs (system_background_jobs) ---

  async listBackgroundJobs(): Promise<BackgroundJobDto[]> {
    const res = await this.db.query<{
      id: string;
      type: string;
      payload: unknown;
      status: string;
      timestamp: Date;
    }>(
      `SELECT id, type, payload, status, timestamp
       FROM system_background_jobs
       ORDER BY timestamp DESC
       LIMIT 500`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload,
      status: r.status,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
    }));
  }

  async insertBackgroundJob(body: {
    id?: string;
    type: string;
    payload?: unknown;
    status?: string;
  }): Promise<BackgroundJobDto> {
    const id = body.id ?? `JOB-${Date.now()}`;
    const type = String(body.type ?? '');
    if (!type) throw new BadRequestException('type is required');
    const status = String(body.status ?? 'QUEUED');
    const payload = body.payload ?? {};
    const ins = await this.db.query<{
      id: string;
      type: string;
      payload: unknown;
      status: string;
      timestamp: Date;
    }>(
      `INSERT INTO system_background_jobs (id, type, payload, status, timestamp)
       VALUES ($1, $2, $3::jsonb, $4, now())
       RETURNING id, type, payload, status, timestamp`,
      [id, type, JSON.stringify(payload), status],
    );
    const row = ins.rows[0];
    if (!row) throw new BadRequestException('Insert failed');
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      status: row.status,
      timestamp:
        row.timestamp instanceof Date
          ? row.timestamp.toISOString()
          : String(row.timestamp),
    };
  }

  // --- AI usage (ai_usage_logs) ---

  async listAiUsageLogs(): Promise<AiUsageLogDto[]> {
    const res = await this.db.query<{
      id: string;
      timestamp: Date;
      userId: string;
      featureName: string;
      model: string;
      prompt: string;
      response: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUSD: string;
      costIDR: string;
    }>(
      `SELECT id::text, timestamp, "userId", "featureName", model, prompt, response,
              "promptTokens", "completionTokens", "totalTokens", "costUSD"::text, "costIDR"::text
       FROM ai_usage_logs
       ORDER BY timestamp DESC
       LIMIT 500`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
      userId: r.userId,
      featureName: r.featureName,
      model: r.model,
      prompt: r.prompt,
      response: r.response,
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      costUSD: parseFloat(r.costUSD),
      costIDR: parseFloat(r.costIDR),
    }));
  }

  async insertAiUsageLog(
    body: Record<string, unknown>,
  ): Promise<AiUsageLogDto> {
    const userId = String(body.userId ?? '');
    const featureName = String(body.featureName ?? '');
    const model = String(body.model ?? '');
    const prompt = String(body.prompt ?? '');
    const response = String(body.response ?? '');
    const promptTokens = Number(body.promptTokens ?? 0);
    const completionTokens = Number(body.completionTokens ?? 0);
    const totalTokens = Number(body.totalTokens ?? 0);
    const costUSD = Number(body.costUSD ?? 0);
    const costIDR = Number(body.costIDR ?? 0);
    if (!userId || !featureName || !model) {
      throw new BadRequestException(
        'userId, featureName, and model are required',
      );
    }
    const ins = await this.db.query<{
      id: string;
      timestamp: Date;
      userId: string;
      featureName: string;
      model: string;
      prompt: string;
      response: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUSD: string;
      costIDR: string;
    }>(
      `INSERT INTO ai_usage_logs (
         id, timestamp, "userId", "featureName", model, prompt, response,
         "promptTokens", "completionTokens", "totalTokens", "costUSD", "costIDR"
       ) VALUES (
         gen_random_uuid(), now(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING id::text, timestamp, "userId", "featureName", model, prompt, response,
         "promptTokens", "completionTokens", "totalTokens", "costUSD"::text, "costIDR"::text`,
      [
        userId,
        featureName,
        model,
        prompt,
        response,
        promptTokens,
        completionTokens,
        totalTokens,
        costUSD,
        costIDR,
      ],
    );
    const r = ins.rows[0];
    if (!r) throw new BadRequestException('Insert failed');
    return {
      id: r.id,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
      userId: r.userId,
      featureName: r.featureName,
      model: r.model,
      prompt: r.prompt,
      response: r.response,
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      costUSD: parseFloat(r.costUSD),
      costIDR: parseFloat(r.costIDR),
    };
  }

  // --- Schema optimizations ---

  async listSchemaOptimizations(): Promise<SchemaOptimizationDto[]> {
    const res = await this.db.query<{
      id: string;
      version: number;
      summary: string | null;
      timestamp: Date;
      result: unknown;
    }>(
      `SELECT id, version, summary, "timestamp", result
       FROM schema_optimizations
       ORDER BY "timestamp" DESC
       LIMIT 100`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      version: r.version,
      summary: r.summary ?? '',
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
      result: r.result,
    }));
  }

  async saveSchemaOptimization(
    body: Record<string, unknown>,
  ): Promise<SchemaOptimizationDto> {
    const id = String(body.id ?? `HIST-${Date.now()}`);
    const version = Number(body.version ?? 1);
    const summary = String(body.summary ?? '');
    const result = body.result ?? {};
    const ts = body.timestamp ? new Date(String(body.timestamp)) : new Date();
    await this.db.query(
      `INSERT INTO schema_optimizations (id, version, summary, "timestamp", result)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         summary = EXCLUDED.summary,
         "timestamp" = EXCLUDED."timestamp",
         result = EXCLUDED.result`,
      [id, version, summary, ts, JSON.stringify(result)],
    );
    const get = await this.db.query<{
      id: string;
      version: number;
      summary: string | null;
      timestamp: Date;
      result: unknown;
    }>(
      `SELECT id, version, summary, "timestamp", result FROM schema_optimizations WHERE id = $1`,
      [id],
    );
    const r = get.rows[0];
    if (!r) throw new NotFoundException('Saved row not found');
    return {
      id: r.id,
      version: r.version,
      summary: r.summary ?? '',
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : String(r.timestamp),
      result: r.result,
    };
  }

  // --- Database metadata (public tables) ---

  async listPublicTablesMeta(): Promise<PublicTableMeta[]> {
    const res = await this.db.query<{ name: string; row_estimate: string }>(
      `SELECT c.relname AS name,
              GREATEST(0, COALESCE(c.reltuples, 0))::bigint::text AS row_estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname ASC`,
    );
    return res.rows.map((r) => ({
      name: r.name,
      rowEstimate: parseInt(r.row_estimate, 10) || 0,
    }));
  }

  async listDatabaseTableDefinitions(): Promise<DatabaseTableDefinitionDto[]> {
    const tables = await this.listPublicTablesMeta();
    const result: DatabaseTableDefinitionDto[] = [];
    for (const table of tables) {
      const columns = await this.getTableColumns(table.name);
      result.push({
        tableName: table.name,
        rowCount: table.rowEstimate,
        columns,
      });
    }
    return result;
  }

  async listDatabaseTableRows(tableName: string): Promise<unknown[]> {
    const normalized = this.assertSafeTableName(tableName);
    const exists = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [normalized],
    );
    if (!exists.rows[0]?.exists) {
      throw new NotFoundException(`Table ${normalized} not found`);
    }
    const sql = `SELECT * FROM public."${normalized}" LIMIT 50`;
    const rows = await this.db.query<Record<string, unknown>>(sql);
    return rows.rows;
  }

  private async getTableColumns(
    tableName: string,
  ): Promise<DatabaseTableColumnDto[]> {
    const table = this.assertSafeTableName(tableName);
    const res = await this.db.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      is_pk: boolean;
      fk_table: string | null;
      fk_column: string | null;
    }>(
      `
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_pk,
        fk.target_table AS fk_table,
        fk.target_column AS fk_column
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT
          kcu.table_schema,
          kcu.table_name,
          kcu.column_name,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
      ) fk
        ON fk.table_schema = c.table_schema
       AND fk.table_name = c.table_name
       AND fk.column_name = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position ASC
      `,
      [table],
    );

    return res.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type || 'text',
      isPk: !!row.is_pk,
      isFk: !!row.fk_table,
      fkTarget:
        row.fk_table && row.fk_column
          ? `${row.fk_table}.${row.fk_column}`
          : undefined,
      isMandatory: row.is_nullable === 'NO',
    }));
  }

  private assertSafeTableName(tableName: string): string {
    const normalized = String(tableName ?? '').trim();
    if (!/^[a-zA-Z0-9_]+$/.test(normalized)) {
      throw new BadRequestException('Invalid table name');
    }
    return normalized;
  }

  /**
   * Current sessions + truncated query text (same DB as Nest). May be empty on permission limits.
   */
  async listPgActivity(): Promise<{
    items: PgActivityRow[];
    note?: string;
  }> {
    try {
      const res = await this.db.query<{
        pid: string;
        usename: string | null;
        application_name: string | null;
        client_addr: string | null;
        state: string | null;
        wait_event_type: string | null;
        seconds_running: string | null;
        query_snippet: string | null;
      }>(
        `SELECT
          a.pid::text,
          a.usename::text,
          a.application_name::text,
          COALESCE(a.client_addr::text, '') AS client_addr,
          a.state::text,
          a.wait_event_type::text,
          CASE
            WHEN a.query_start IS NULL THEN NULL
            ELSE EXTRACT(EPOCH FROM (now() - a.query_start))::int::text
          END AS seconds_running,
          LEFT(COALESCE(a.query, ''), 400) AS query_snippet
        FROM pg_stat_activity a
        WHERE a.datname = current_database()
          AND a.pid <> pg_backend_pid()
        ORDER BY a.query_start DESC NULLS LAST
        LIMIT 40`,
      );
      return {
        items: res.rows.map((r) => ({
          pid: parseInt(r.pid, 10) || 0,
          usename: r.usename,
          applicationName: r.application_name,
          clientAddr: r.client_addr || null,
          state: r.state,
          waitEventType: r.wait_event_type,
          secondsRunning:
            r.seconds_running != null && r.seconds_running !== ''
              ? parseInt(r.seconds_running, 10)
              : null,
          querySnippet: r.query_snippet ?? '',
        })),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        items: [],
        note: `pg_stat_activity unavailable: ${msg}`,
      };
    }
  }

  // --- Maintenance snapshot ---

  async getMaintenanceStatus(): Promise<{
    database: Awaited<ReturnType<DatabaseService['getHealth']>>;
    counts: {
      securityLogs: number;
      automationQueue: number;
      backgroundJobs: number;
      aiUsageLogs: number;
    };
  }> {
    const database = await this.db.getHealth();
    const [a, b, c, d] = await Promise.all([
      this.db.query(`SELECT count(*)::text AS c FROM system_security_logs`),
      this.db.query(`SELECT count(*)::text AS c FROM automation_queue`),
      this.db.query(`SELECT count(*)::text AS c FROM system_background_jobs`),
      this.db.query(`SELECT count(*)::text AS c FROM ai_usage_logs`),
    ]);
    return {
      database,
      counts: {
        securityLogs: parseInt(a.rows[0]?.c ?? '0', 10) || 0,
        automationQueue: parseInt(b.rows[0]?.c ?? '0', 10) || 0,
        backgroundJobs: parseInt(c.rows[0]?.c ?? '0', 10) || 0,
        aiUsageLogs: parseInt(d.rows[0]?.c ?? '0', 10) || 0,
      },
    };
  }
}
