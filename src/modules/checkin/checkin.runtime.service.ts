import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckinQueryDto,
  OfflineSyncBatchDto,
  RegisterDeviceDto,
  ScanQrDto,
  ScanResultDto,
} from './dto';
import { DbService } from '../../common/db.service';
import { AutomationsEmitService } from '../automations/automations-emit.service';

interface EventRow {
  internalId: string;
  id: string;
  name: string;
  date: string | Date | null;
  endDate: string | Date | null;
  time: string | null;
  parentEventId: string | null;
  parentEventInternalId: string | null;
  admissionPolicy: string | null;
  creditTags: string[] | null;
  accessRuleTags?: string[] | null;
  doneTag: string | null;
  tiers:
    | Array<{
        id: string;
        name: string;
        grantTagIds?: string[];
      }>
    | null;
  gates: Array<{
    id: string;
    name: string;
    allowedTiers: string[];
    assignedUserIds: string[];
    isActive: boolean;
  }> | null;
}

interface WalletTicketRow {
  internalId: string;
  id: string;
  userId: string;
  title: string;
  status: string;
  qrData: string | null;
  meta: Record<string, unknown> | null;
}

interface AttendanceIdentityRow {
  id: string;
  userId: string;
  name: string;
  email: string | null;
}

interface TicketAccessValidationResult {
  ok: boolean;
  status?: ScanResultDto['status'];
  message?: string;
  ticketTier?: string;
  sessionId?: string | null;
}

export interface AttendanceLedgerRow {
  id: string;
  eventId: string;
  eventName: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  scannedAt: string | Date;
  method: string;
  verificationCode: string | null;
  eventColor: string | null;
  gateId: string | null;
  sessionId: string | null;
  ticketTier: string | null;
  status: string | null;
  ticketUniqueId: string | null;
  scannerDevice: string | null;
  scannedByUserId: string | null;
}

export interface ScannerDeviceRow {
  id: string;
  deviceId: string;
  deviceName: string;
  eventId: string | null;
  gateId: string | null;
  isActive: boolean;
  lastSyncAt: string | Date | null;
  registeredAt: string | Date;
}

@Injectable()
export class CheckinRuntimeService {
  private attendanceOperatorColumnsReady = false;
  private accessRuleTablesReady: boolean | null = null;

  constructor(
    private readonly db: DbService,
    private readonly automationsEmit: AutomationsEmitService,
  ) {}

  async scanQr(
    dto: ScanQrDto,
    scannedByUserId?: string,
  ): Promise<ScanResultDto> {
    await this.ensureAttendanceOperatorColumns();
    const event = await this.findEvent(dto.eventId);
    const ticket = await this.findTicketByQr(dto.qrString);

    if (!ticket) {
      return {
        success: false,
        status: 'INVALID_TICKET',
        message: 'Invalid QR code',
      };
    }

    const isSeriesPass = this.isSeriesParentTicketForEvent(ticket, event);

    if (ticket.status === 'USED' && !isSeriesPass) {
      return {
        success: false,
        status: 'ALREADY_USED',
        message: 'Ticket already used',
      };
    }

    if (
      ticket.status !== 'ACTIVE' &&
      ticket.status !== 'CLAIMED' &&
      !(ticket.status === 'USED' && isSeriesPass)
    ) {
      return {
        success: false,
        status: 'BLOCKED',
        message: `Ticket status ${ticket.status} is not allowed`,
      };
    }

    const accessValidation = this.validateTicketAccessForEvent(ticket, event, {
      fallbackTier: dto.tierId,
    });
    if (!accessValidation.ok) {
      return {
        success: false,
        status: accessValidation.status ?? 'BLOCKED',
        message: accessValidation.message ?? 'Access denied',
      };
    }

    const ticketTier = accessValidation.ticketTier ?? 'GENERAL';
    const gate = dto.gateId
      ? (event.gates ?? []).find((item) => item.id === dto.gateId)
      : undefined;

    if (dto.gateId && !gate) {
      return {
        success: false,
        status: 'WRONG_GATE',
        message: 'Gate configuration not found',
      };
    }

    if (gate?.allowedTiers?.length) {
      const allowed = this.matchesAllowedTier(ticketTier, gate.allowedTiers, event);

      if (!allowed) {
        const suggestedGate = (event.gates ?? []).find((item) =>
          this.matchesAllowedTier(ticketTier, item.allowedTiers, event),
        );

        return {
          success: false,
          status: 'WRONG_GATE',
          message: `Tier ${ticketTier} is not allowed at this gate`,
          suggestedGate: suggestedGate?.name,
        };
      }
    }

    const duplicate = await this.db.query<{ id: string }>(
      `
      select id
      from event_attendance_ledger
      where "eventId" = $1::uuid
        and coalesce("ticketUniqueId", '') = $2
        and coalesce(status, 'SUCCESS') = 'SUCCESS'
      limit 1
      `,
      [event.internalId, ticket.id],
    );

    if (duplicate.rows[0]) {
      return {
        success: false,
        status: 'ALREADY_USED',
        message: 'Ticket already checked in for this event',
        checkinId: duplicate.rows[0].id,
      };
    }

    const member = await this.findAttendanceIdentityForUser(ticket.userId);
    const verificationCode = this.generateVerificationCode();
    const scannedAt = new Date().toISOString();
    const result = await this.db.query<{ id: string }>(
      `
      insert into event_attendance_ledger (
        "eventId",
        "eventName",
        "memberId",
        "memberName",
        "memberEmail",
        "scannedAt",
        method,
        "verificationCode",
        "eventColor",
        "gateId",
        "sessionId",
        "ticketTier",
        status,
        "ticketUniqueId",
        "scannerDevice",
        "scannedByUserId"
      )
      values (
        $1::uuid, $2, $3, $4, $5, now(), 'GATE_SCAN', $6, '#4F46E5', $7, $8, $9, 'SUCCESS', $10, $11, $12
      )
      returning id::text as id
      `,
      [
        event.internalId,
        event.name,
        member.id,
        member.name,
        member.email,
        verificationCode,
        dto.gateId ?? null,
        accessValidation.sessionId ?? null,
        ticketTier,
        ticket.id,
        dto.deviceId ?? null,
        scannedByUserId ?? null,
      ],
    );

    await this.consumeTicketIfNeeded(ticket, event);

    try {
      await this.automationsEmit.enqueueTrigger({
        triggerId: 'EVENT_CHECK_IN',
        payload: {
          memberId: member.id,
          userId: member.userId,
          member_name: member.name,
          email: member.email ?? undefined,
          eventId: event.id,
          event_name: event.name,
          checkin_time: scannedAt,
          ticket_tier: ticketTier,
        },
        description: `Event check-in ${member.name} @ ${event.name}`,
      });
    } catch {
      // best effort: attendance must still succeed if automation queue is unavailable
    }

    return {
      success: true,
      status: 'SUCCESS',
      message: 'Entry authorized',
      checkinId: result.rows[0].id,
      verificationCode,
      eventColor: this.resolveEventColor(event),
      scannedAt,
      user: {
        id: member.id,
        fullName: member.name,
        avatarUrl: null,
        membershipTier: ticketTier,
      },
      ticket: {
        tagName: ticket.title,
        tierName: ticketTier,
        remainingBalance: 1,
      },
    };
  }

  async manualCheckin(
    memberId: string,
    eventIdentifier: string,
    method: 'SELF_SCAN' | 'ADMIN_OVERRIDE' | 'GATE_SCAN' = 'GATE_SCAN',
  ): Promise<ScanResultDto> {
    const event = await this.findEvent(eventIdentifier);
    const member = await this.findMember(memberId);
    const verificationCode = this.generateVerificationCode();
    const scannedAt = new Date().toISOString();

    const result = await this.db.query<{ id: string }>(
      `
      insert into event_attendance_ledger (
        "eventId",
        "eventName",
        "memberId",
        "memberName",
        "memberEmail",
        "scannedAt",
        method,
        "verificationCode",
        "eventColor",
        status
      )
      values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        now(),
        $6,
        $7,
        '#4F46E5',
        'SUCCESS'
      )
      returning id::text as id
      `,
      [
        event.internalId,
        event.name,
        member.id,
        member.name,
        member.email,
        method,
        verificationCode,
      ],
    );

    try {
      await this.automationsEmit.enqueueTrigger({
        triggerId: 'EVENT_CHECK_IN',
        payload: {
          memberId: member.id,
          userId: member.id,
          member_name: member.name,
          email: member.email ?? undefined,
          eventId: event.id,
          event_name: event.name,
          checkin_time: scannedAt,
          ticket_tier: 'GENERAL',
        },
        description: `Manual event check-in ${member.name} @ ${event.name}`,
      });
    } catch {
      // best effort
    }

    return {
      success: true,
      status: 'SUCCESS',
      message: 'Manual attendance recorded',
      checkinId: result.rows[0].id,
      verificationCode,
      eventColor: this.resolveEventColor(event),
      scannedAt,
      user: {
        id: member.id,
        fullName: member.name,
        avatarUrl: null,
        membershipTier: 'GENERAL',
      },
      ticket: {
        tagName: 'Manual',
        tierName: 'GENERAL',
        remainingBalance: 1,
      },
    };
  }

  async selfCheckin(
    userId: string,
    userEmail: string | undefined,
    eventIdentifier: string,
    method: 'SELF_SCAN' | 'LINK_CLICKED' = 'SELF_SCAN',
    venueQr?: string,
  ): Promise<ScanResultDto> {
    const event = await this.findEvent(eventIdentifier);

    const checkinWindow = this.validateSelfCheckinWindow(event);
    if (!checkinWindow.ok) {
      return {
        success: false,
        status: 'BLOCKED',
        message: checkinWindow.message ?? 'Self check-in is not open yet',
      };
    }

    if (venueQr?.trim()) {
      const normalizedVenueQr = venueQr.trim();
      const expectedSuffix = `:${event.id}`;
      const matchesEvent =
        normalizedVenueQr === event.id ||
        normalizedVenueQr.endsWith(expectedSuffix);

      if (!matchesEvent) {
        return {
          success: false,
          status: 'WRONG_EVENT',
          message: 'Venue QR does not match this event',
        };
      }
    }

    const ticket = await this.findActiveTicketForUserEvent(userId, event);
    if (!ticket) {
      return {
        success: false,
        status: 'BLOCKED',
        message: 'No active ticket found for this event',
      };
    }

    const member = await this.findAttendanceIdentityForUser(userId, userEmail);
    const accessValidation = this.validateTicketAccessForEvent(ticket, event);
    if (!accessValidation.ok) {
      return {
        success: false,
        status: accessValidation.status ?? 'BLOCKED',
        message: accessValidation.message ?? 'Access denied',
      };
    }

    return this.recordTicketAttendance({
      event,
      member,
      ticket,
      method,
      ticketTier: accessValidation.ticketTier ?? 'GENERAL',
      sessionId: accessValidation.sessionId ?? null,
      successMessage:
        method === 'LINK_CLICKED'
          ? 'Attendance recorded. Opening session.'
          : 'Attendance recorded',
    });
  }

  async getCheckins(
    query: CheckinQueryDto,
  ): Promise<{ data: AttendanceLedgerRow[]; total: number }> {
    await this.ensureAttendanceOperatorColumns();
    const params: unknown[] = [];
    const where: string[] = [];

    if (query.eventId?.trim()) {
      params.push(await this.resolveEventInternalId(query.eventId));
      where.push(`"eventId" = $${params.length}::uuid`);
    }
    if (query.gateId?.trim()) {
      params.push(query.gateId.trim());
      where.push(`"gateId" = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.startDate) {
      params.push(query.startDate.toISOString());
      where.push(`"scannedAt" >= $${params.length}::timestamptz`);
    }
    if (query.endDate) {
      params.push(query.endDate.toISOString());
      where.push(`"scannedAt" <= $${params.length}::timestamptz`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const baseSql = `
      select
        id::text as id,
        coalesce((select public_id from events e where e.id::text = event_attendance_ledger."eventId"::text), "eventId"::text) as "eventId",
        "eventName" as "eventName",
        "memberId" as "memberId",
        "memberName" as "memberName",
        "memberEmail" as "memberEmail",
        "scannedAt" as "scannedAt",
        method,
        "verificationCode" as "verificationCode",
        "eventColor" as "eventColor",
        "gateId" as "gateId",
        (select coalesce(public_id, id::text) from events e where e.id::text = event_attendance_ledger."sessionId"::text) as "sessionId",
        "ticketTier" as "ticketTier",
        status,
        "ticketUniqueId" as "ticketUniqueId",
        "scannerDevice" as "scannerDevice",
        "scannedByUserId" as "scannedByUserId"
      from event_attendance_ledger
      ${whereSql}
      order by "scannedAt" desc
    `;

    const { rows, total } = await this.db.paginatedQuery<AttendanceLedgerRow>(
      baseSql,
      params,
      query.page,
      query.limit,
    );

    return {
      data: rows.map((row) => ({
        ...row,
        eventId: row.eventId,
        scannedAt: this.formatTimestamp(row.scannedAt),
      })),
      total,
    };
  }

  async getEventStats(eventIdentifier: string) {
    const event = await this.findEvent(eventIdentifier);

    const totalCheckedInResult = await this.db.query<{ count: string }>(
      "select count(*)::text as count from event_attendance_ledger where \"eventId\" = $1::uuid and coalesce(status, 'SUCCESS') = 'SUCCESS'",
      [event.internalId],
    );

    const byTierResult = await this.db.query<{
      tier: string | null;
      count: string;
    }>(
      `
      select "ticketTier" as tier, count(*)::text as count
      from event_attendance_ledger
      where "eventId" = $1::uuid
      group by "ticketTier"
      `,
      [event.internalId],
    );

    const byGateResult = await this.db.query<{
      gate: string | null;
      count: string;
    }>(
      `
      select "gateId" as gate, count(*)::text as count
      from event_attendance_ledger
      where "eventId" = $1::uuid
      group by "gateId"
      `,
      [event.internalId],
    );

    const hourlyResult = await this.db.query<{ bucket: string; count: string }>(
      `
      select to_char(date_trunc('hour', "scannedAt"), 'YYYY-MM-DD HH24:00') as bucket,
             count(*)::text as count
      from event_attendance_ledger
      where "eventId" = $1::uuid
      group by 1
      order by 1 asc
      `,
      [event.internalId],
    );

    return {
      totalRegistered: Number(event.attendeeCount ?? 0),
      totalCheckedIn: parseInt(totalCheckedInResult.rows[0]?.count ?? '0', 10),
      byTier: Object.fromEntries(
        byTierResult.rows.map((row) => [
          row.tier ?? 'GENERAL',
          parseInt(row.count, 10),
        ]),
      ),
      byGate: Object.fromEntries(
        byGateResult.rows.map((row) => [
          row.gate ?? 'UNASSIGNED',
          parseInt(row.count, 10),
        ]),
      ),
      hourlyCheckins: Object.fromEntries(
        hourlyResult.rows.map((row) => [row.bucket, parseInt(row.count, 10)]),
      ),
    };
  }

  async checkout(checkinId: string) {
    await this.ensureAttendanceOperatorColumns();
    const result = await this.db.query<AttendanceLedgerRow>(
      `
      update event_attendance_ledger
      set status = 'SUCCESS'
      where id::text = $1
      returning
        id::text as id,
        coalesce((select public_id from events e where e.id::text = event_attendance_ledger."eventId"::text), "eventId"::text) as "eventId",
        "eventName" as "eventName",
        "memberId" as "memberId",
        "memberName" as "memberName",
        "memberEmail" as "memberEmail",
        "scannedAt" as "scannedAt",
        method,
        "verificationCode" as "verificationCode",
        "eventColor" as "eventColor",
        "gateId" as "gateId",
        (select coalesce(public_id, id::text) from events e where e.id::text = event_attendance_ledger."sessionId"::text) as "sessionId",
        "ticketTier" as "ticketTier",
        status,
        "ticketUniqueId" as "ticketUniqueId",
        "scannerDevice" as "scannerDevice",
        "scannedByUserId" as "scannedByUserId"
      `,
      [checkinId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException(`Check-in ${checkinId} not found`);
    }

    return {
      ...result.rows[0],
      scannedAt: this.formatTimestamp(result.rows[0].scannedAt),
    };
  }

  async registerDevice(dto: RegisterDeviceDto) {
    const eventInternalId = await this.resolveEventInternalId(dto.eventId);
    const result = await this.db.query<ScannerDeviceRow>(
      `
      insert into scanner_devices (
        device_id,
        device_name,
        assigned_event_id,
        assigned_gate_id,
        is_active,
        registered_at
      )
      values ($1, $2, $3::uuid, $4, true, now())
      on conflict (device_id)
      do update set
        device_name = excluded.device_name,
        assigned_event_id = excluded.assigned_event_id,
        assigned_gate_id = excluded.assigned_gate_id,
        is_active = true
      returning
        id::text as id,
        device_id as "deviceId",
        device_name as "deviceName",
        coalesce((select public_id from events e where e.id = scanner_devices.assigned_event_id), scanner_devices.assigned_event_id::text) as "eventId",
        assigned_gate_id as "gateId",
        is_active as "isActive",
        last_sync_at as "lastSyncAt",
        registered_at as "registeredAt"
      `,
      [
        dto.deviceId.trim(),
        dto.deviceName.trim(),
        eventInternalId,
        dto.gateId ?? null,
      ],
    );

    return this.toDevice(result.rows[0]);
  }

  async getDevices(eventId?: string) {
    const params: unknown[] = [];
    let where = '';

    if (eventId?.trim()) {
      params.push(await this.resolveEventInternalId(eventId));
      where = 'where assigned_event_id = $1::uuid';
    }

    const result = await this.db.query<ScannerDeviceRow>(
      `
      select
        id::text as id,
        device_id as "deviceId",
        device_name as "deviceName",
        coalesce((select public_id from events e where e.id = assigned_event_id), assigned_event_id::text) as "eventId",
        assigned_gate_id as "gateId",
        is_active as "isActive",
        last_sync_at as "lastSyncAt",
        registered_at as "registeredAt"
      from scanner_devices
      ${where}
      order by registered_at desc
      `,
      params,
    );

    return result.rows.map((row) => this.toDevice(row));
  }

  async deactivateDevice(deviceId: string): Promise<void> {
    await this.db.query(
      'update scanner_devices set is_active = false where device_id = $1',
      [deviceId],
    );
  }

  async syncOfflineCheckins(dto: OfflineSyncBatchDto) {
    const results: Array<{
      offlineId: string;
      success: boolean;
      checkinId?: string;
      error?: string;
    }> = [];

    for (const item of dto.items) {
      try {
        if (item.actionType === 'CHECKOUT') {
          results.push({
            offlineId: item.offlineId,
            success: false,
            error: 'Offline checkout not implemented yet',
          });
          continue;
        }

        const scanResult = await this.scanQr(
          {
            qrString: item.qrString,
            eventId: item.eventId,
            gateId: item.gateId,
            deviceId: dto.deviceId,
            offlineEntryId: item.offlineId,
          },
          undefined,
        );

        results.push({
          offlineId: item.offlineId,
          success: scanResult.success,
          checkinId: scanResult.checkinId,
          error: scanResult.success ? undefined : scanResult.message,
        });
      } catch (error) {
        await this.db.query(
          `
          insert into offline_sync_queue (device_id, action_type, payload, status, attempts, created_at)
          values ($1, $2, $3::jsonb, 'FAILED', 1, now())
          `,
          [dto.deviceId, item.actionType, JSON.stringify(item)],
        );

        results.push({
          offlineId: item.offlineId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await this.db.query(
      'update scanner_devices set last_sync_at = now() where device_id = $1',
      [dto.deviceId],
    );

    return {
      processed: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  async getPendingSyncItems(deviceId: string) {
    const result = await this.db.query<{
      id: string;
      payload: unknown;
      status: string;
    }>(
      `
      select id::text as id, payload, status
      from offline_sync_queue
      where device_id = $1
        and status in ('PENDING_SYNC', 'FAILED')
      order by created_at asc
      `,
      [deviceId],
    );

    return result.rows;
  }

  private async findEvent(
    identifier: string,
  ): Promise<EventRow & { attendeeCount: number }> {
    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.date,
        e."endDate" as "endDate",
        e.time,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
        e."parentEventId"::text as "parentEventInternalId",
        e."admissionPolicy" as "admissionPolicy",
        e."creditTags" as "creditTags",
        e."doneTag" as "doneTag",
        e.tiers,
        e.gates
      from events e
      where e.public_id = $1 or e.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Event ${identifier} not found`);
    }

    row.accessRuleTags = await this.resolveEventAccessTags(row);

    const attendeeCountResult = await this.db.query<{ count: string }>(
      'select count(*)::text as count from event_attendance_ledger where "eventId" = $1::uuid',
      [row.internalId],
    );

    return {
      ...row,
      attendeeCount: parseInt(attendeeCountResult.rows[0]?.count ?? '0', 10),
    };
  }

  private async findTicketByQr(
    qrString: string,
  ): Promise<WalletTicketRow | null> {
    const parts = qrString.split(':');
    const itemIdentifier = parts.length > 3 ? parts[3] : undefined;

    const result = await this.db.query<WalletTicketRow>(
      `
      select
        wi.id::text as "internalId",
        coalesce(wi.public_id, wi.id::text) as id,
        wi."userId" as "userId",
        wi.title,
        wi.status,
        wi."qrData" as "qrData",
        wi.meta
      from wallet_items wi
      where wi."qrData" = $1
         or coalesce(wi.public_id, wi.id::text) = $2
      limit 1
      `,
      [qrString, itemIdentifier ?? ''],
    );

    return result.rows[0] ?? null;
  }

  private async findActiveTicketForUserEvent(
    userId: string,
    event: EventRow,
  ): Promise<WalletTicketRow | null> {
    const result = await this.db.query<WalletTicketRow & { eventMatchRank: number }>(
      `
      select
        wi.id::text as "internalId",
        coalesce(wi.public_id, wi.id::text) as id,
        wi."userId" as "userId",
        wi.title,
        wi.status,
        wi."qrData" as "qrData",
        wi.meta,
        case
          when coalesce(wi.meta->>'eventId', '') = $2 then 0
          when $3 <> '' and coalesce(wi.meta->>'eventId', '') = $3 then 1
          else 2
        end as "eventMatchRank"
      from wallet_items wi
      where wi."userId" = $1
        and wi.type = 'TICKET'
        and (
          wi.status in ('ACTIVE', 'CLAIMED')
          -- Series/container passes may already be USED from an earlier session;
          -- still allow them for other child sessions of the same parent.
          or (
            wi.status = 'USED'
            and $3 <> ''
            and coalesce(wi.meta->>'eventId', '') = $3
          )
        )
        and (
          coalesce(wi.meta->>'eventId', '') = $2
          or ($3 <> '' and coalesce(wi.meta->>'eventId', '') = $3)
        )
      order by "eventMatchRank" asc, wi."createdAt" desc
      limit 1
      `,
      [userId, event.id, event.parentEventId ?? ''],
    );

    return result.rows[0] ?? null;
  }

  private async findMember(identifier: string) {
    const result = await this.db.query<{
      id: string;
      name: string;
      email: string | null;
    }>(
      `
      select
        coalesce(public_id, id::text) as id,
        name,
        email
      from members
      where public_id = $1 or id::text = $1
      limit 1
      `,
      [identifier],
    );

    if (!result.rows[0]) {
      throw new NotFoundException(`Member ${identifier} not found`);
    }

    return result.rows[0];
  }

  private async findAttendanceIdentityForUser(
    userId: string,
    fallbackEmail?: string,
  ): Promise<AttendanceIdentityRow> {
    const userResult = await this.db.query<{
      userId: string;
      name: string | null;
      email: string | null;
    }>(
      `
      select
        u.id::text as "userId",
        nullif(trim(u.name), '') as name,
        nullif(trim(lower(u.email)), '') as email
      from "User" u
      where u.id::text = $1
      limit 1
      `,
      [userId],
    );

    const userRow = userResult.rows[0];
    const email = userRow?.email ?? fallbackEmail?.trim().toLowerCase() ?? null;
    const memberByEmail = email ? await this.findMemberByEmail(email) : null;
    const derivedName =
      memberByEmail?.name ??
      userRow?.name?.trim() ??
      (email?.split('@')[0]?.trim() || 'Member');

    return {
      id: memberByEmail?.id ?? userId,
      userId,
      name: derivedName,
      email,
    };
  }

  private async findMemberByEmail(email: string) {
    const result = await this.db.query<{
      id: string;
      name: string;
      email: string | null;
    }>(
      `
      select
        coalesce(public_id, id::text) as id,
        name,
        email
      from members
      where lower(trim(email)) = $1
      limit 1
      `,
      [email.trim().toLowerCase()],
    );

    return result.rows[0] ?? null;
  }

  private async resolveEventInternalId(
    identifier: string | undefined,
  ): Promise<string | null> {
    const trimmed = identifier?.trim();
    if (!trimmed) {
      return null;
    }

    const result = await this.db.query<{ internalId: string }>(
      `
      select id::text as "internalId"
      from events
      where public_id = $1 or id::text = $1
      limit 1
      `,
      [trimmed],
    );

    return result.rows[0]?.internalId ?? null;
  }

  private async hasAccessRuleTables(): Promise<boolean> {
    if (this.accessRuleTablesReady !== null) {
      return this.accessRuleTablesReady;
    }

    const result = await this.db.query<{
      eventRules: string | null;
      masterTags: string | null;
    }>(`
      select
        to_regclass('public.event_access_rules')::text as "eventRules",
        to_regclass('public.master_access_tags')::text as "masterTags"
    `);

    const row = result.rows[0];
    this.accessRuleTablesReady = Boolean(row?.eventRules && row?.masterTags);
    return this.accessRuleTablesReady;
  }

  private async resolveEventAccessTags(event: EventRow): Promise<string[]> {
    const fallbackTags = (event.creditTags ?? [])
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);

    if (!(await this.hasAccessRuleTables())) {
      return fallbackTags;
    }

    const eventIds = [event.internalId, event.parentEventInternalId]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean);

    if (eventIds.length === 0) {
      return fallbackTags;
    }

    const result = await this.db.query<{ code: string | null }>(
      `
      select distinct mat.code
      from event_access_rules ear
      join master_access_tags mat on mat.id = ear.tag_id
      where ear.event_id::text = any($1::text[])
      `,
      [eventIds],
    );

    const resolvedTags = result.rows
      .map((row) => (typeof row.code === 'string' ? row.code.trim() : ''))
      .filter(Boolean);

    return resolvedTags.length > 0
      ? Array.from(new Set(resolvedTags))
      : fallbackTags;
  }

  private readMetaString(
    meta: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = meta?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readMetaStringArray(
    meta: Record<string, unknown> | null,
    keys: string[],
  ): string[] {
    for (const key of keys) {
      const value = meta?.[key];
      if (Array.isArray(value)) {
        return value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean);
      }
      if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
      }
    }
    return [];
  }

  private resolveTicketAccessTags(
    ticket: WalletTicketRow,
    event: EventRow,
    ticketTier: string,
  ): string[] {
    const directTags = this.readMetaStringArray(ticket.meta, [
      'accessTags',
      'grantTagIds',
      'creditTags',
      'accessTagCodes',
    ]);
    const sourceCreditTag = this.readMetaString(ticket.meta, 'sourceCreditTag');

    const inferredTierTags = (event.tiers ?? [])
      .filter((tier) =>
        this.expandTierCandidates(ticketTier, event).some((candidate) =>
          this.expandTierCandidates(tier.id, event).includes(candidate) ||
          this.expandTierCandidates(tier.name, event).includes(candidate),
        ),
      )
      .flatMap((tier) =>
        Array.isArray(tier.grantTagIds)
          ? tier.grantTagIds
          : [],
      )
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);

    return Array.from(
      new Set([
        ...directTags,
        ...(sourceCreditTag ? [sourceCreditTag] : []),
        ...inferredTierTags,
      ]),
    );
  }

  private validateTicketAccessForEvent(
    ticket: WalletTicketRow,
    event: EventRow,
    options?: { fallbackTier?: string },
  ): TicketAccessValidationResult {
    const ticketEventId = this.readMetaString(ticket.meta, 'eventId');
    const directMatch = ticketEventId === event.id;
    const parentMatch =
      Boolean(event.parentEventId) && ticketEventId === event.parentEventId;

    if (!directMatch && !parentMatch) {
      return {
        ok: false,
        status: 'WRONG_EVENT',
        message: 'Ticket is registered for another event',
      };
    }

    const ticketTier =
      this.readMetaString(ticket.meta, 'targetTier') ??
      options?.fallbackTier ??
      'GENERAL';

    const normalizedTicketTags = this.resolveTicketAccessTags(
      ticket,
      event,
      ticketTier,
    );
    const eventCreditTags = (event.accessRuleTags ?? event.creditTags ?? [])
      .map((tag) => (typeof tag === 'string' ? tag.trim().toUpperCase() : ''))
      .filter(Boolean);
    const admissionPolicy = (event.admissionPolicy ?? 'PRE_BOOKED').trim();

    if (
      admissionPolicy === 'PRE_BOOKED' &&
      eventCreditTags.length > 0
    ) {
      if (normalizedTicketTags.length === 0) {
        return {
          ok: directMatch,
          status: directMatch ? undefined : 'BLOCKED',
          message: directMatch
            ? undefined
            : 'Ticket does not include a resolvable access tag for this event',
          ticketTier,
          sessionId: directMatch ? null : event.id,
        };
      }

      const hasMatchingTag = normalizedTicketTags
        .map((tag) => tag.trim().toUpperCase())
        .some((tag) =>
        eventCreditTags.includes(tag),
      );
      if (!hasMatchingTag) {
        return {
          ok: false,
          status: 'BLOCKED',
          message:
            'Ticket does not include the required access tag for this event',
        };
      }
    }

    return {
      ok: true,
      ticketTier,
      sessionId: directMatch ? null : event.id,
    };
  }

  private generateVerificationCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  /**
   * True when the wallet ticket belongs to a parent CONTAINER event and the
   * check-in target is one of its child sessions. Those passes must remain
   * reusable across the series (one ticket → many weeks).
   */
  private isSeriesParentTicketForEvent(
    ticket: WalletTicketRow,
    event: EventRow,
  ): boolean {
    const ticketEventId = this.readMetaString(ticket.meta, 'eventId');
    return (
      Boolean(event.parentEventId) &&
      Boolean(ticketEventId) &&
      ticketEventId === event.parentEventId &&
      ticketEventId !== event.id
    );
  }

  private async consumeTicketIfNeeded(
    ticket: WalletTicketRow,
    event: EventRow,
  ): Promise<void> {
    if (this.isSeriesParentTicketForEvent(ticket, event)) {
      return;
    }

    await this.db.query(
      `
      update wallet_items
      set status = 'USED',
          "updatedAt" = now()
      where id::text = $1
         or coalesce(public_id, id::text) = $2
      `,
      [ticket.internalId, ticket.id],
    );
  }

  private async recordTicketAttendance(input: {
    event: EventRow;
    member: AttendanceIdentityRow;
    ticket: WalletTicketRow;
    method: 'SELF_SCAN' | 'LINK_CLICKED';
    ticketTier: string;
    sessionId: string | null;
    successMessage: string;
  }): Promise<ScanResultDto> {
    await this.ensureAttendanceOperatorColumns();
    const duplicate = await this.db.query<{
      id: string;
      scannedAt: string | Date;
      verificationCode: string | null;
    }>(
      `
      select
        id::text as id,
        "scannedAt" as "scannedAt",
        "verificationCode" as "verificationCode"
      from event_attendance_ledger
      where "eventId" = $1::uuid
        and coalesce("ticketUniqueId", '') = $2
        and coalesce(status, 'SUCCESS') = 'SUCCESS'
      limit 1
      `,
      [input.event.internalId, input.ticket.id],
    );

    const existing = duplicate.rows[0];
    if (existing) {
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Attendance already recorded',
        checkinId: existing.id,
        verificationCode:
          existing.verificationCode ?? this.generateVerificationCode(),
        eventColor: this.resolveEventColor(input.event),
        scannedAt: this.formatTimestamp(existing.scannedAt),
        user: {
          id: input.member.id,
          fullName: input.member.name,
          avatarUrl: null,
          membershipTier: input.ticketTier,
        },
        ticket: {
          tagName: input.ticket.title,
          tierName: input.ticketTier,
          remainingBalance: 1,
        },
      };
    }

    const verificationCode = this.generateVerificationCode();
    const scannedAt = new Date().toISOString();
    const result = await this.db.query<{ id: string }>(
      `
      insert into event_attendance_ledger (
        "eventId",
        "eventName",
        "memberId",
        "memberName",
        "memberEmail",
        "scannedAt",
        method,
        "verificationCode",
        "eventColor",
        "gateId",
        "sessionId",
        "ticketTier",
        status,
        "ticketUniqueId",
        "scannerDevice",
        "scannedByUserId"
      )
      values (
        $1::uuid, $2, $3, $4, $5, now(), $6, $7, $8, null, $9, $10, 'SUCCESS', $11, null, null
      )
      returning id::text as id
      `,
      [
        input.event.internalId,
        input.event.name,
        input.member.id,
        input.member.name,
        input.member.email,
        input.method,
        verificationCode,
        this.resolveEventColor(input.event),
        input.sessionId,
        input.ticketTier,
        input.ticket.id,
      ],
    );

    await this.consumeTicketIfNeeded(input.ticket, input.event);

    await this.grantDoneTagIfConfigured(input.member, input.event);

    try {
      await this.automationsEmit.enqueueTrigger({
        triggerId: 'EVENT_CHECK_IN',
        payload: {
          memberId: input.member.id,
          userId: input.member.userId,
          member_name: input.member.name,
          email: input.member.email ?? undefined,
          eventId: input.event.id,
          event_name: input.event.name,
          checkin_time: scannedAt,
          ticket_tier: input.ticketTier,
        },
        description: `${input.method} ${input.member.name} @ ${input.event.name}`,
      });
      if (
        input.method === 'SELF_SCAN' &&
        this.isEarlyArrival(input.event, scannedAt)
      ) {
        await this.automationsEmit.enqueueTrigger({
          triggerId: 'EVENT_EARLY_ARRIVAL',
          payload: {
            memberId: input.member.id,
            userId: input.member.userId,
            member_name: input.member.name,
            email: input.member.email ?? undefined,
            eventId: input.event.id,
            event_name: input.event.name,
            checkin_time: scannedAt,
            ticket_tier: input.ticketTier,
          },
          description: `Early arrival ${input.member.name} @ ${input.event.name}`,
        });
      }
    } catch {
      // best effort
    }

    return {
      success: true,
      status: 'SUCCESS',
      message: input.successMessage,
      checkinId: result.rows[0].id,
      verificationCode,
      eventColor: this.resolveEventColor(input.event),
      scannedAt,
      user: {
        id: input.member.id,
        fullName: input.member.name,
        avatarUrl: null,
        membershipTier: input.ticketTier,
      },
      ticket: {
        tagName: input.ticket.title,
        tierName: input.ticketTier,
        remainingBalance: 1,
      },
    };
  }

  private formatTimestamp(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  }

  private validateSelfCheckinWindow(event: EventRow): {
    ok: boolean;
    message?: string;
  } {
    const start = this.parseEventDateTime(event.date, event.time);
    if (!start) {
      return { ok: true };
    }

    const opensAt = new Date(start.getTime() - 2 * 60 * 60 * 1000);
    const closesAt = this.parseEventEndDateTime(event.endDate, event.time, start);
    const now = new Date();

    if (now < opensAt) {
      return {
        ok: false,
        message: `Self check-in opens at ${opensAt.toISOString()}`,
      };
    }

    if (closesAt && now > closesAt) {
      return {
        ok: false,
        message: 'Self check-in window has closed',
      };
    }

    return { ok: true };
  }

  private parseEventDateTime(
    dateValue: string | Date | null,
    timeValue: string | null,
  ): Date | null {
    if (!dateValue) return null;
    const baseDate = new Date(dateValue);
    if (Number.isNaN(baseDate.getTime())) return null;

    const timeMatch = timeValue?.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      baseDate.setHours(0, 0, 0, 0);
      return baseDate;
    }

    const [, rawHours, rawMinutes] = timeMatch;
    baseDate.setHours(Number(rawHours), Number(rawMinutes), 0, 0);
    return Number.isNaN(baseDate.getTime()) ? null : baseDate;
  }

  private parseEventEndDateTime(
    endDateValue: string | Date | null,
    timeValue: string | null,
    fallbackStart: Date,
  ): Date | null {
    const end = endDateValue ? new Date(endDateValue) : new Date(fallbackStart);
    if (Number.isNaN(end.getTime())) return null;

    const timeMatch = timeValue?.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const [, rawHours, rawMinutes] = timeMatch;
      end.setHours(Number(rawHours) + 6, Number(rawMinutes), 0, 0);
    } else {
      end.setHours(23, 59, 59, 999);
    }

    return end;
  }

  private isEarlyArrival(event: EventRow, scannedAtIso: string): boolean {
    const start = this.parseEventDateTime(event.date, event.time);
    if (!start) {
      return false;
    }

    const scannedAt = new Date(scannedAtIso);
    if (Number.isNaN(scannedAt.getTime())) {
      return false;
    }

    return scannedAt.getTime() <= start.getTime() - 30 * 60 * 1000;
  }

  private resolveEventColor(event: Pick<EventRow, 'id' | 'name'>): string {
    const palette = [
      '#16A34A',
      '#EA580C',
      '#2563EB',
      '#DB2777',
      '#0891B2',
      '#7C3AED',
      '#D97706',
      '#0F766E',
    ];

    const seed = `${event.id}:${event.name}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }

    return palette[hash % palette.length] ?? '#4F46E5';
  }

  private async grantDoneTagIfConfigured(
    member: AttendanceIdentityRow,
    event: EventRow,
  ): Promise<void> {
    const doneTag = event.doneTag?.trim();
    if (!doneTag) {
      return;
    }

    const result = await this.db.query<{
      internalId: string;
      earnedDoneTags: string[] | null;
    }>(
      `
      select
        id::text as "internalId",
        "earnedDoneTags" as "earnedDoneTags"
      from members
      where public_id = $1
         or id::text = $1
         or lower(trim(email)) = $2
      limit 1
      `,
      [member.id, member.email?.trim().toLowerCase() ?? ''],
    );

    const row = result.rows[0];
    if (!row) {
      return;
    }

    const earnedDoneTags = Array.isArray(row.earnedDoneTags)
      ? row.earnedDoneTags
      : [];
    if (earnedDoneTags.includes(doneTag)) {
      return;
    }

    await this.db.query(
      `
      update members
      set "earnedDoneTags" = $2::text[],
          "updatedAt" = now()
      where id = $1::uuid
      `,
      [row.internalId, [...earnedDoneTags, doneTag]],
    );
  }

  private async ensureAttendanceOperatorColumns() {
    if (this.attendanceOperatorColumnsReady) {
      return;
    }

    await this.db.query(`
      alter table event_attendance_ledger
      add column if not exists "scannedByUserId" text
    `);

    this.attendanceOperatorColumnsReady = true;
  }

  private matchesAllowedTier(
    ticketTier: string,
    allowedTiers: string[],
    event: EventRow,
  ): boolean {
    const ticketCandidates = this.expandTierCandidates(ticketTier, event);
    const allowedCandidates = allowedTiers.flatMap((tier) =>
      this.expandTierCandidates(tier, event),
    );

    return ticketCandidates.some((candidate) =>
      allowedCandidates.includes(candidate),
    );
  }

  private expandTierCandidates(
    tierValue: string | null | undefined,
    event: EventRow,
  ): string[] {
    const trimmed = tierValue?.trim();
    if (!trimmed) {
      return [];
    }

    const normalized = trimmed.toUpperCase();
    const candidates = new Set<string>([normalized]);
    const matchedTier = (event.tiers ?? []).find((tier) => {
      const tierId = String(tier.id ?? '').trim().toUpperCase();
      const tierName = String(tier.name ?? '').trim().toUpperCase();
      return tierId === normalized || tierName === normalized;
    });

    if (matchedTier) {
      const tierId = String(matchedTier.id ?? '').trim().toUpperCase();
      const tierName = String(matchedTier.name ?? '').trim().toUpperCase();
      if (tierId) candidates.add(tierId);
      if (tierName) candidates.add(tierName);
    }

    for (const candidate of Array.from(candidates)) {
      if (normalized.includes(candidate) || candidate.includes(normalized)) {
        candidates.add(candidate);
      }
    }

    return Array.from(candidates);
  }

  private toDevice(row: ScannerDeviceRow) {
    return {
      id: row.id,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      assignedEventId: row.eventId ?? undefined,
      assignedGateId: row.gateId ?? undefined,
      isActive: row.isActive,
      lastSyncAt:
        row.lastSyncAt instanceof Date
          ? row.lastSyncAt.toISOString()
          : (row.lastSyncAt ?? undefined),
      registeredAt:
        row.registeredAt instanceof Date
          ? row.registeredAt.toISOString()
          : row.registeredAt,
    };
  }
}
