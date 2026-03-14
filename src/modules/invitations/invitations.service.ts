import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../../common/db.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  DeclineInvitationDto,
  InvitationQueryDto,
  UpdateInvitationDto,
} from './dto';
import { EventInvitation, InvitationStatus } from './entities';
import { WalletService } from '../wallet/wallet.service';
import { WalletItemContract } from '../wallet/entities';

interface InvitationRow {
  internalId: string;
  id: string;
  eventInternalId: string;
  eventId: string;
  eventName: string;
  tierId: string | null;
  tierName: string | null;
  memberInternalId: string;
  memberId: string;
  memberName: string;
  status: InvitationStatus;
  validUntil: string | Date;
  sentAt: string | Date;
  sentBy: string;
  updatedAt: string | Date;
}

interface ResolvedEvent {
  internalId: string;
  id: string;
  name: string;
  tiers: Array<{ id: string; name?: string }> | null;
  type: string;
  date: string | Date;
  location: string | null;
  selectionConfig: EventSelectionConfig | null;
  parentInternalId: string | null;
}

interface ResolvedMember {
  internalId: string;
  id: string;
  name: string;
}

interface EventSelectionConfig {
  mode: 'BUNDLE' | 'OPTION';
  minSelect: number;
  maxSelect: number;
}

interface PreparedInvitationInsert {
  publicId: string;
  eventInternalId: string;
  eventName: string;
  tierId: string | null;
  tierName: string | null;
  memberInternalId: string;
  memberName: string;
  status: InvitationStatus;
  validUntil: string;
  sentAt: string;
  sentBy: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: DbService,
    private readonly walletService: WalletService,
  ) {}

  async findAll(query: InvitationQueryDto): Promise<EventInvitation[]> {
    const params: string[] = [];
    const where: string[] = [];

    if (query.memberId?.trim()) {
      params.push(query.memberId.trim());
      where.push(
        `(coalesce(m.public_id, m.id::text) = $${params.length} or m.id::text = $${params.length})`,
      );
    }

    if (query.eventId?.trim()) {
      params.push(query.eventId.trim());
      where.push(
        `(coalesce(e.public_id, e.id::text) = $${params.length} or e.id::text = $${params.length})`,
      );
    }

    if (query.status) {
      params.push(query.status);
      where.push(`i.status = $${params.length}`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const result = await this.db.query<InvitationRow>(
      `
      select
        i.id::text as "internalId",
        coalesce(i.public_id, i.id::text) as id,
        e.id::text as "eventInternalId",
        coalesce(e.public_id, e.id::text) as "eventId",
        i."eventName" as "eventName",
        i."tierId" as "tierId",
        i."tierName" as "tierName",
        m.id::text as "memberInternalId",
        coalesce(m.public_id, m.id::text) as "memberId",
        i."memberName" as "memberName",
        i.status,
        i."validUntil" as "validUntil",
        i."sentAt" as "sentAt",
        i."sentBy" as "sentBy",
        i."updatedAt" as "updatedAt"
      from event_invitations i
      join events e on e.id = i."eventId"
      join members m on m.id = i."memberId"
      ${whereSql}
      order by i."sentAt" desc
      `,
      params,
    );

    return result.rows.map((row) => this.toInvitation(row));
  }

  async findOne(identifier: string): Promise<EventInvitation> {
    const row = await this.findRowByIdentifier(identifier);
    return this.toInvitation(row);
  }

  async findByMember(memberIdentifier: string): Promise<EventInvitation[]> {
    return this.findAll({ memberId: memberIdentifier });
  }

  async createMany(invitations: CreateInvitationDto[]): Promise<EventInvitation[]> {
    const prepared: PreparedInvitationInsert[] = [];

    for (const invitation of invitations) {
      const event = await this.resolveEvent(invitation.eventId);
      const member = await this.resolveMember(invitation.memberId);
      const resolvedTier = this.resolveTierSnapshot(
        event.tiers,
        invitation.tierId,
        invitation.tierName,
      );

      prepared.push({
        publicId: await this.resolveInvitationPublicId(invitation.id),
        eventInternalId: event.internalId,
        eventName: invitation.eventName?.trim() || event.name,
        tierId: invitation.tierId?.trim() || null,
        tierName: resolvedTier,
        memberInternalId: member.internalId,
        memberName: invitation.memberName?.trim() || member.name,
        status: invitation.status,
        validUntil: invitation.validUntil,
        sentAt: invitation.sentAt ?? new Date().toISOString(),
        sentBy: invitation.sentBy.trim(),
      });
    }

    return this.db.withTransaction(async (client) => {
      const created: EventInvitation[] = [];

      for (const invitation of prepared) {
        await client.query(
          `
          insert into event_invitations (
            public_id,
            "eventId",
            "eventName",
            "tierId",
            "tierName",
            "memberId",
            "memberName",
            status,
            "validUntil",
            "sentAt",
            "sentBy",
            "updatedAt"
          )
          values (
            $1,
            $2::uuid,
            $3,
            $4,
            $5,
            $6::uuid,
            $7,
            $8,
            $9::timestamptz,
            $10::timestamptz,
            $11,
            now()
          )
          `,
          [
            invitation.publicId,
            invitation.eventInternalId,
            invitation.eventName,
            invitation.tierId,
            invitation.tierName,
            invitation.memberInternalId,
            invitation.memberName,
            invitation.status,
            invitation.validUntil,
            invitation.sentAt,
            invitation.sentBy,
          ],
        );

        const row = await this.findRowByIdentifier(invitation.publicId, client);
        created.push(this.toInvitation(row));
      }

      return created;
    });
  }

  async update(
    identifier: string,
    dto: UpdateInvitationDto,
  ): Promise<EventInvitation> {
    const existing = await this.findRowByIdentifier(identifier);

    if (dto.id && dto.id !== existing.id && dto.id !== existing.internalId) {
      throw new BadRequestException('Invitation ID cannot be changed');
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    let resolvedEvent: ResolvedEvent | null = null;
    if (dto.eventId) {
      resolvedEvent = await this.resolveEvent(dto.eventId);
      params.push(resolvedEvent.internalId);
      fields.push(`"eventId" = $${params.length}::uuid`);

      params.push(dto.eventName?.trim() || resolvedEvent.name);
      fields.push(`"eventName" = $${params.length}`);
    } else if (dto.eventName !== undefined) {
      params.push(dto.eventName.trim());
      fields.push(`"eventName" = $${params.length}`);
    }

    let resolvedMember: ResolvedMember | null = null;
    if (dto.memberId) {
      resolvedMember = await this.resolveMember(dto.memberId);
      params.push(resolvedMember.internalId);
      fields.push(`"memberId" = $${params.length}::uuid`);

      params.push(dto.memberName?.trim() || resolvedMember.name);
      fields.push(`"memberName" = $${params.length}`);
    } else if (dto.memberName !== undefined) {
      params.push(dto.memberName.trim());
      fields.push(`"memberName" = $${params.length}`);
    }

    if (dto.tierId !== undefined) {
      params.push(dto.tierId?.trim() || null);
      fields.push(`"tierId" = $${params.length}`);
    }

    if (dto.tierName !== undefined) {
      params.push(dto.tierName?.trim() || null);
      fields.push(`"tierName" = $${params.length}`);
    } else if (dto.tierId !== undefined) {
      const tierName = this.resolveTierSnapshot(
        resolvedEvent?.tiers ?? null,
        dto.tierId,
        undefined,
      );
      params.push(tierName);
      fields.push(`"tierName" = $${params.length}`);
    }

    if (dto.status !== undefined) {
      params.push(dto.status);
      fields.push(`status = $${params.length}`);
    }

    if (dto.validUntil !== undefined) {
      params.push(dto.validUntil);
      fields.push(`"validUntil" = $${params.length}::timestamptz`);
    }

    if (dto.sentAt !== undefined) {
      params.push(dto.sentAt);
      fields.push(`"sentAt" = $${params.length}::timestamptz`);
    }

    if (dto.sentBy !== undefined) {
      params.push(dto.sentBy.trim());
      fields.push(`"sentBy" = $${params.length}`);
    }

    if (!fields.length) {
      return this.toInvitation(existing);
    }

    params.push(existing.internalId);

    await this.db.query(
      `
      update event_invitations
      set ${fields.join(', ')}, "updatedAt" = now()
      where id = $${params.length}::uuid
      `,
      params,
    );

    const updated = await this.findRowByIdentifier(existing.id);
    return this.toInvitation(updated);
  }

  async accept(
    identifier: string,
    dto: AcceptInvitationDto,
  ): Promise<{
    invitation: EventInvitation;
    issuedWalletItems: WalletItemContract[];
  }> {
    return this.db.withTransaction(async (client) => {
      const invitation = await this.findRowByIdentifier(identifier, client, {
        forUpdate: true,
      });
      const member = await this.resolveMember(dto.userId, client);

      this.assertInvitationOwnership(invitation, member.internalId);
      await this.ensureInvitationIsActionable(invitation, client);

      const event = await this.resolveEvent(invitation.eventId, client);
      const targetEvents = await this.resolveAcceptanceEvents(
        event,
        dto.selectedSubEventIds,
        client,
      );

      const issuedWalletItems: WalletItemContract[] = [];
      for (const targetEvent of targetEvents) {
        const issued = await this.walletService.issueInvitationTicket(
          {
            userId: member.id,
            eventId: targetEvent.id,
            eventName: targetEvent.name,
            eventDate: targetEvent.date,
            location: targetEvent.location,
            invitationId: invitation.id,
            tierId: invitation.tierId ?? null,
            tierName: invitation.tierName ?? 'Invited Guest',
          },
          client,
        );
        issuedWalletItems.push(issued);
      }

      await this.updateInvitationStatus(invitation.internalId, 'ACCEPTED', client);
      const updated = await this.findRowByIdentifier(invitation.id, client);

      return {
        invitation: this.toInvitation(updated),
        issuedWalletItems,
      };
    });
  }

  async decline(
    identifier: string,
    dto: DeclineInvitationDto,
  ): Promise<EventInvitation> {
    return this.db.withTransaction(async (client) => {
      const invitation = await this.findRowByIdentifier(identifier, client, {
        forUpdate: true,
      });
      const member = await this.resolveMember(dto.userId, client);

      this.assertInvitationOwnership(invitation, member.internalId);
      await this.ensureInvitationIsActionable(invitation, client);

      await this.updateInvitationStatus(invitation.internalId, 'DECLINED', client);
      const updated = await this.findRowByIdentifier(invitation.id, client);

      return this.toInvitation(updated);
    });
  }

  private async resolveInvitationPublicId(
    requestedId?: string,
  ): Promise<string> {
    const preferred = requestedId?.trim();

    if (preferred) {
      const existing = await this.db.query<{ exists: boolean }>(
        'select exists(select 1 from event_invitations where public_id = $1) as exists',
        [preferred],
      );

      if (existing.rows[0]?.exists) {
        throw new ConflictException(`Invitation ID ${preferred} already exists`);
      }

      return preferred;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `INV-${Date.now()}${attempt}`;
      const existing = await this.db.query<{ exists: boolean }>(
        'select exists(select 1 from event_invitations where public_id = $1) as exists',
        [candidate],
      );

      if (!existing.rows[0]?.exists) {
        return candidate;
      }
    }

    throw new ConflictException('Could not generate unique invitation ID');
  }

  private async resolveEvent(
    identifier: string,
    executor: Pick<PoolClient, 'query'> | DbService = this.db,
  ): Promise<ResolvedEvent> {
    const result = await executor.query<
      ResolvedEvent & {
        tiers: unknown;
        selectionConfig: unknown;
        date: string | Date;
      }
    >(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.tiers,
        e.type,
        e.date,
        e.location,
        e."selectionConfig" as "selectionConfig",
        e."parentEventId"::text as "parentInternalId"
      from events e
      where coalesce(e.public_id, e.id::text) = $1 or e.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Event ${identifier} not found`);
    }

    return {
      internalId: row.internalId,
      id: row.id,
      name: row.name,
      tiers: Array.isArray(row.tiers) ? (row.tiers as ResolvedEvent['tiers']) : null,
      type: row.type,
      date: row.date,
      location: row.location,
      selectionConfig: this.parseSelectionConfig(row.selectionConfig),
      parentInternalId: row.parentInternalId,
    };
  }

  private async resolveMember(
    identifier: string,
    executor: Pick<PoolClient, 'query'> | DbService = this.db,
  ): Promise<ResolvedMember> {
    const result = await executor.query<ResolvedMember>(
      `
      select
        m.id::text as "internalId",
        coalesce(m.public_id, m.id::text) as id,
        m.name
      from members m
      where coalesce(m.public_id, m.id::text) = $1 or m.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Member ${identifier} not found`);
    }

    return row;
  }

  private async findChildEvents(
    parentInternalId: string,
    executor: Pick<PoolClient, 'query'> | DbService = this.db,
  ): Promise<ResolvedEvent[]> {
    const result = await executor.query<
      ResolvedEvent & {
        tiers: unknown;
        selectionConfig: unknown;
        date: string | Date;
      }
    >(
      `
      select
        e.id::text as "internalId",
        coalesce(e.public_id, e.id::text) as id,
        e.name,
        e.tiers,
        e.type,
        e.date,
        e.location,
        e."selectionConfig" as "selectionConfig",
        e."parentEventId"::text as "parentInternalId"
      from events e
      where e."parentEventId" = $1::uuid
      order by e.date asc, e.name asc
      `,
      [parentInternalId],
    );

    return result.rows.map((row) => ({
      internalId: row.internalId,
      id: row.id,
      name: row.name,
      tiers: Array.isArray(row.tiers) ? (row.tiers as ResolvedEvent['tiers']) : null,
      type: row.type,
      date: row.date,
      location: row.location,
      selectionConfig: this.parseSelectionConfig(row.selectionConfig),
      parentInternalId: row.parentInternalId,
    }));
  }

  private resolveTierSnapshot(
    tiers: Array<{ id: string; name?: string }> | null,
    tierId: string | undefined,
    tierName: string | undefined,
  ): string | null {
    if (!tierId) {
      return tierName?.trim() || null;
    }

    const resolved = tiers?.find((tier) => tier.id === tierId);
    if (tiers && tiers.length > 0 && !resolved) {
      throw new BadRequestException(`Tier ${tierId} not found in target event`);
    }

    return tierName?.trim() || resolved?.name || null;
  }

  private async resolveAcceptanceEvents(
    event: ResolvedEvent,
    selectedSubEventIds: string[] | undefined,
    executor: Pick<PoolClient, 'query'> | DbService,
  ): Promise<ResolvedEvent[]> {
    const selectionConfig = event.selectionConfig;

    if (
      event.type.toUpperCase() !== 'CONTAINER' ||
      selectionConfig?.mode !== 'OPTION'
    ) {
      return [event];
    }

    const requestedSelections = (selectedSubEventIds ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (!requestedSelections.length) {
      throw new BadRequestException(
        'You must select at least one event from the invitation options.',
      );
    }

    if (new Set(requestedSelections).size !== requestedSelections.length) {
      throw new BadRequestException('Duplicate sub-event selection is not allowed');
    }

    if (requestedSelections.length < selectionConfig.minSelect) {
      throw new BadRequestException(
        `Minimum selection is ${selectionConfig.minSelect}.`,
      );
    }

    if (requestedSelections.length > selectionConfig.maxSelect) {
      throw new BadRequestException(
        `Maximum selection is ${selectionConfig.maxSelect}.`,
      );
    }

    const childEvents = await this.findChildEvents(event.internalId, executor);
    const childEventMap = new Map<string, ResolvedEvent>();
    for (const childEvent of childEvents) {
      childEventMap.set(childEvent.id, childEvent);
      childEventMap.set(childEvent.internalId, childEvent);
    }

    const resolvedSelections: ResolvedEvent[] = [];
    const seenChildren = new Set<string>();

    for (const selectedId of requestedSelections) {
      const childEvent = childEventMap.get(selectedId);
      if (!childEvent) {
        throw new BadRequestException(
          `Selected sub-event ${selectedId} is not part of this invitation bundle.`,
        );
      }

      if (seenChildren.has(childEvent.internalId)) {
        throw new BadRequestException('Duplicate sub-event selection is not allowed');
      }

      seenChildren.add(childEvent.internalId);
      resolvedSelections.push(childEvent);
    }

    return resolvedSelections;
  }

  private async ensureInvitationIsActionable(
    invitation: InvitationRow,
    executor: Pick<PoolClient, 'query'> | DbService,
  ): Promise<void> {
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Invitation already processed');
    }

    if (new Date(invitation.validUntil) <= new Date()) {
      await this.updateInvitationStatus(invitation.internalId, 'EXPIRED', executor);
      throw new BadRequestException('Invitation expired');
    }
  }

  private assertInvitationOwnership(
    invitation: InvitationRow,
    memberInternalId: string,
  ): void {
    if (invitation.memberInternalId !== memberInternalId) {
      throw new NotFoundException('Invitation not found for the requested member');
    }
  }

  private async updateInvitationStatus(
    invitationInternalId: string,
    status: InvitationStatus,
    executor: Pick<PoolClient, 'query'> | DbService,
  ): Promise<void> {
    await executor.query(
      `
      update event_invitations
      set status = $2, "updatedAt" = now()
      where id = $1::uuid
      `,
      [invitationInternalId, status],
    );
  }

  private parseSelectionConfig(value: unknown): EventSelectionConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<EventSelectionConfig>;
    if (
      (candidate.mode === 'BUNDLE' || candidate.mode === 'OPTION') &&
      typeof candidate.minSelect === 'number' &&
      typeof candidate.maxSelect === 'number'
    ) {
      return {
        mode: candidate.mode,
        minSelect: candidate.minSelect,
        maxSelect: candidate.maxSelect,
      };
    }

    return null;
  }

  private async findRowByIdentifier(
    identifier: string,
    executor: Pick<PoolClient, 'query'> | DbService = this.db,
    options: { forUpdate?: boolean } = {},
  ): Promise<InvitationRow> {
    const result = await executor.query<InvitationRow>(
      `
      select
        i.id::text as "internalId",
        coalesce(i.public_id, i.id::text) as id,
        e.id::text as "eventInternalId",
        coalesce(e.public_id, e.id::text) as "eventId",
        i."eventName" as "eventName",
        i."tierId" as "tierId",
        i."tierName" as "tierName",
        m.id::text as "memberInternalId",
        coalesce(m.public_id, m.id::text) as "memberId",
        i."memberName" as "memberName",
        i.status,
        i."validUntil" as "validUntil",
        i."sentAt" as "sentAt",
        i."sentBy" as "sentBy",
        i."updatedAt" as "updatedAt"
      from event_invitations i
      join events e on e.id = i."eventId"
      join members m on m.id = i."memberId"
      where i.public_id = $1 or i.id::text = $1
      limit 1
      ${options.forUpdate ? 'for update' : ''}
      `,
      [identifier.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Invitation ${identifier} not found`);
    }

    return row;
  }

  private toInvitation(row: InvitationRow): EventInvitation {
    return {
      id: row.id,
      eventId: row.eventId,
      eventName: row.eventName,
      tierId: row.tierId ?? undefined,
      tierName: row.tierName ?? undefined,
      memberId: row.memberId,
      memberName: row.memberName,
      status: row.status,
      validUntil: this.toIsoString(row.validUntil),
      sentAt: this.toIsoString(row.sentAt),
      sentBy: row.sentBy,
    };
  }

  private toIsoString(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
