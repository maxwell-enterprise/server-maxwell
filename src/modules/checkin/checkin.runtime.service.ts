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

interface EventRow {
  internalId: string;
  id: string;
  name: string;
  parentEventId: string | null;
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
  constructor(private readonly db: DbService) {}

  async scanQr(dto: ScanQrDto, _scannedByUserId?: string): Promise<ScanResultDto> {
    const event = await this.findEvent(dto.eventId);
    const ticket = await this.findTicketByQr(dto.qrString);

    if (!ticket) {
      return {
        success: false,
        status: 'INVALID_TICKET',
        message: 'Invalid QR code',
      };
    }

    if (ticket.status === 'USED') {
      return {
        success: false,
        status: 'ALREADY_USED',
        message: 'Ticket already used',
      };
    }

    if (ticket.status !== 'ACTIVE' && ticket.status !== 'CLAIMED') {
      return {
        success: false,
        status: 'BLOCKED',
        message: `Ticket status ${ticket.status} is not allowed`,
      };
    }

    const ticketEventId = this.readMetaString(ticket.meta, 'eventId');
    const directMatch = ticketEventId === event.id;
    const parentMatch = event.parentEventId && ticketEventId === event.parentEventId;

    if (!directMatch && !parentMatch) {
      return {
        success: false,
        status: 'WRONG_EVENT',
        message: 'Ticket is registered for another event',
      };
    }

    const ticketTier = this.readMetaString(ticket.meta, 'targetTier') ?? dto.tierId ?? 'GENERAL';
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
      const allowed = gate.allowedTiers.some(
        (tier) =>
          tier.toUpperCase() === ticketTier.toUpperCase() ||
          ticketTier.toUpperCase().includes(tier.toUpperCase()),
      );

      if (!allowed) {
        const suggestedGate = (event.gates ?? []).find((item) =>
          item.allowedTiers.some((tier) => tier.toUpperCase() === ticketTier.toUpperCase()),
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

    const member = await this.findMember(ticket.userId);
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
        "scannerDevice"
      )
      values (
        $1::uuid, $2, $3, $4, $5, now(), 'GATE_SCAN', $6, '#4F46E5', $7, $8, $9, 'SUCCESS', $10, $11
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
        directMatch ? null : event.id,
        ticketTier,
        ticket.id,
        dto.deviceId ?? null,
      ],
    );

    return {
      success: true,
      status: 'SUCCESS',
      message: 'Entry authorized',
      checkinId: result.rows[0].id,
      verificationCode,
      eventColor: '#4F46E5',
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

  async manualCheckin(memberId: string, eventIdentifier: string, method: 'SELF_SCAN' | 'ADMIN_OVERRIDE' | 'GATE_SCAN' = 'GATE_SCAN'): Promise<ScanResultDto> {
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

    return {
      success: true,
      status: 'SUCCESS',
      message: 'Manual attendance recorded',
      checkinId: result.rows[0].id,
      verificationCode,
      eventColor: '#4F46E5',
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

  async getCheckins(query: CheckinQueryDto): Promise<{ data: AttendanceLedgerRow[]; total: number }> {
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
        "eventId"::text as "eventId",
        "eventName" as "eventName",
        "memberId" as "memberId",
        "memberName" as "memberName",
        "memberEmail" as "memberEmail",
        "scannedAt" as "scannedAt",
        method,
        "verificationCode" as "verificationCode",
        "eventColor" as "eventColor",
        "gateId" as "gateId",
        "sessionId" as "sessionId",
        "ticketTier" as "ticketTier",
        status,
        "ticketUniqueId" as "ticketUniqueId",
        "scannerDevice" as "scannerDevice"
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
      'select count(*)::text as count from event_attendance_ledger where "eventId" = $1::uuid and coalesce(status, \'SUCCESS\') = \'SUCCESS\'',
      [event.internalId],
    );

    const byTierResult = await this.db.query<{ tier: string | null; count: string }>(
      `
      select "ticketTier" as tier, count(*)::text as count
      from event_attendance_ledger
      where "eventId" = $1::uuid
      group by "ticketTier"
      `,
      [event.internalId],
    );

    const byGateResult = await this.db.query<{ gate: string | null; count: string }>(
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
        byTierResult.rows.map((row) => [row.tier ?? 'GENERAL', parseInt(row.count, 10)]),
      ),
      byGate: Object.fromEntries(
        byGateResult.rows.map((row) => [row.gate ?? 'UNASSIGNED', parseInt(row.count, 10)]),
      ),
      hourlyCheckins: Object.fromEntries(
        hourlyResult.rows.map((row) => [row.bucket, parseInt(row.count, 10)]),
      ),
    };
  }

  async checkout(checkinId: string) {
    const result = await this.db.query<AttendanceLedgerRow>(
      `
      update event_attendance_ledger
      set status = 'SUCCESS'
      where id::text = $1
      returning
        id::text as id,
        "eventId"::text as "eventId",
        "eventName" as "eventName",
        "memberId" as "memberId",
        "memberName" as "memberName",
        "memberEmail" as "memberEmail",
        "scannedAt" as "scannedAt",
        method,
        "verificationCode" as "verificationCode",
        "eventColor" as "eventColor",
        "gateId" as "gateId",
        "sessionId" as "sessionId",
        "ticketTier" as "ticketTier",
        status,
        "ticketUniqueId" as "ticketUniqueId",
        "scannerDevice" as "scannerDevice"
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
      [dto.deviceId.trim(), dto.deviceName.trim(), eventInternalId, dto.gateId ?? null],
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
          [
            dto.deviceId,
            item.actionType,
            JSON.stringify(item),
          ],
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
    const result = await this.db.query<{ id: string; payload: unknown; status: string }>(
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

  private async findEvent(identifier: string): Promise<EventRow & { attendeeCount: number }> {
    const result = await this.db.query<EventRow>(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        (select coalesce(parent.public_id, parent.id::text) from events parent where parent.id = e."parentEventId") as "parentEventId",
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

    const attendeeCountResult = await this.db.query<{ count: string }>(
      'select count(*)::text as count from event_attendance_ledger where "eventId" = $1::uuid',
      [row.internalId],
    );

    return {
      ...row,
      attendeeCount: parseInt(attendeeCountResult.rows[0]?.count ?? '0', 10),
    };
  }

  private async findTicketByQr(qrString: string): Promise<WalletTicketRow | null> {
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

  private async findMember(identifier: string) {
    const result = await this.db.query<{ id: string; name: string; email: string | null }>(
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

  private async resolveEventInternalId(identifier: string | undefined): Promise<string | null> {
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

  private readMetaString(meta: Record<string, unknown> | null, key: string): string | null {
    const value = meta?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private generateVerificationCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private formatTimestamp(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
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
          : row.lastSyncAt ?? undefined,
      registeredAt:
        row.registeredAt instanceof Date
          ? row.registeredAt.toISOString()
          : row.registeredAt,
    };
  }
}
