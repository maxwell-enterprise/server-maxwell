import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import type { Badge, PointRule, UserGamificationProfile } from './gamification.types';

@Injectable()
export class GamificationService {
  constructor(private readonly db: DatabaseService) {}

  private rowToBadge(row: Record<string, unknown>): Badge {
    const th = row.triggerThreshold;
    return {
      id: String(row.id ?? ''),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      icon: String(row.icon ?? ''),
      rarity: String(row.rarity ?? 'COMMON') as Badge['rarity'],
      pointBonus: Number(row.pointBonus ?? 0),
      autoTrigger: row.autoTrigger
        ? (String(row.autoTrigger) as Badge['autoTrigger'])
        : undefined,
      triggerThreshold:
        th != null && th !== '' ? Number(th) : undefined,
    };
  }

  private rowToRule(row: Record<string, unknown>): PointRule {
    return {
      id: String(row.id ?? ''),
      triggerType: String(row.triggerType ?? '') as PointRule['triggerType'],
      points: Number(row.points ?? 0),
      description: String(row.description ?? ''),
      isActive: row.isActive !== false,
    };
  }

  private rowToProfile(row: Record<string, unknown>): UserGamificationProfile {
    const badges = row.badges;
    return {
      userId: String(row.userId ?? ''),
      userName: String(row.userName ?? ''),
      avatarUrl:
        row.avatarUrl != null && String(row.avatarUrl) !== ''
          ? String(row.avatarUrl)
          : undefined,
      totalPoints: Number(row.totalPoints ?? 0),
      currentLevel: String(row.currentLevel ?? 'Bronze'),
      badges: Array.isArray(badges) ? (badges as string[]) : [],
      rank: row.rank != null ? Number(row.rank) : 0,
      streakCount: Number(row.streakCount ?? 0),
    };
  }

  async listBadges(): Promise<Badge[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, code, name, description, icon, rarity, "pointBonus", "autoTrigger", "triggerThreshold"
       FROM gamification_badges
       ORDER BY code ASC`,
    );
    return result.rows.map((r) => this.rowToBadge(r));
  }

  async upsertBadge(idFromUrl: string, body: Record<string, unknown>): Promise<void> {
    const id = String(body.id ?? idFromUrl);
    const code = String(body.code ?? '');
    const name = String(body.name ?? '');
    const description = body.description != null ? String(body.description) : '';
    const icon = body.icon != null ? String(body.icon) : '';
    const rarity = String(body.rarity ?? 'COMMON');
    const pointBonus = Number(body.pointBonus ?? 0);
    const autoTrigger =
      body.autoTrigger != null && String(body.autoTrigger) !== ''
        ? String(body.autoTrigger)
        : null;
    const triggerThreshold =
      body.triggerThreshold != null && body.triggerThreshold !== ''
        ? Number(body.triggerThreshold)
        : null;

    await this.db.query(
      `INSERT INTO gamification_badges (id, code, name, description, icon, rarity, "pointBonus", "autoTrigger", "triggerThreshold")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         rarity = EXCLUDED.rarity,
         "pointBonus" = EXCLUDED."pointBonus",
         "autoTrigger" = EXCLUDED."autoTrigger",
         "triggerThreshold" = EXCLUDED."triggerThreshold"`,
      [
        id,
        code,
        name,
        description,
        icon,
        rarity,
        pointBonus,
        autoTrigger,
        triggerThreshold,
      ],
    );
  }

  async listRules(): Promise<PointRule[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, "triggerType", points, description, "isActive"
       FROM gamification_rules
       ORDER BY id ASC`,
    );
    return result.rows.map((r) => this.rowToRule(r));
  }

  async upsertRule(idFromUrl: string, body: Record<string, unknown>): Promise<void> {
    const id = String(body.id ?? idFromUrl);
    const triggerType = String(body.triggerType ?? '');
    const points = Number(body.points ?? 0);
    const description = body.description != null ? String(body.description) : '';
    const isActive = body.isActive !== false;

    await this.db.query(
      `INSERT INTO gamification_rules (id, "triggerType", points, description, "isActive")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         "triggerType" = EXCLUDED."triggerType",
         points = EXCLUDED.points,
         description = EXCLUDED.description,
         "isActive" = EXCLUDED."isActive"`,
      [id, triggerType, points, description, isActive],
    );
  }

  async listProfiles(): Promise<UserGamificationProfile[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT "userId", "userName", "avatarUrl", "totalPoints", "currentLevel", badges, rank, "streakCount"
       FROM gamification_profiles
       ORDER BY "totalPoints" DESC`,
    );
    return result.rows.map((r) => this.rowToProfile(r));
  }

  async getProfileByUserId(userId: string): Promise<UserGamificationProfile> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT "userId", "userName", "avatarUrl", "totalPoints", "currentLevel", badges, rank, "streakCount"
       FROM gamification_profiles
       WHERE "userId" = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Gamification profile not found');
    return this.rowToProfile(row);
  }

  async upsertProfile(userIdFromUrl: string, body: Record<string, unknown>): Promise<void> {
    const userId = String(body.userId ?? userIdFromUrl);
    const userName = String(body.userName ?? '');
    const avatarUrl =
      body.avatarUrl != null && String(body.avatarUrl) !== ''
        ? String(body.avatarUrl)
        : null;
    const totalPoints = Number(body.totalPoints ?? 0);
    const currentLevel = String(body.currentLevel ?? 'Bronze');
    const badges = Array.isArray(body.badges) ? (body.badges as string[]) : [];
    const rank = body.rank != null ? Number(body.rank) : null;
    const streakCount = Number(body.streakCount ?? 0);

    await this.db.query(
      `INSERT INTO gamification_profiles ("userId", "userName", "avatarUrl", "totalPoints", "currentLevel", badges, rank, "streakCount")
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8)
       ON CONFLICT ("userId") DO UPDATE SET
         "userName" = EXCLUDED."userName",
         "avatarUrl" = EXCLUDED."avatarUrl",
         "totalPoints" = EXCLUDED."totalPoints",
         "currentLevel" = EXCLUDED."currentLevel",
         badges = EXCLUDED.badges,
         rank = EXCLUDED.rank,
         "streakCount" = EXCLUDED."streakCount"`,
      [
        userId,
        userName,
        avatarUrl,
        totalPoints,
        currentLevel,
        badges,
        rank,
        streakCount,
      ],
    );
  }
}
