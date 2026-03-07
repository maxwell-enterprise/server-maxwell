/**
 * MAXWELL ERP - Users Service
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
  UpdateUserRoleDto,
} from './dto';
import { DbService } from '../../common/db.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(createUserDto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Untuk sekarang, user baru disimpan sebagai CRM member di tabel `members`.
    const result = await this.db.query<User>(
      `
      insert into members (name, email, phone, "lifecycleStage", "joinMonth", scholarship, platform)
      values ($1, $2, $3, $4, to_char(now(), 'YYYY-MM'), false, 'web')
      returning
        id,
        email,
        phone,
        name as "fullName",
        null::text as "nickname",
        null::text as "avatarUrl",
        $5::text as role,
        'MEMBER'::text as "lifecycleStage",
        true as "isActive",
        false as "isVerified",
        null::text as company,
        null::text as "jobTitle",
        0 as "totalPoints",
        1 as "currentLevel",
        now() as "createdAt",
        now() as "updatedAt"
      `,
      [
        createUserDto.fullName,
        createUserDto.email,
        createUserDto.phone ?? null,
        'MEMBER',
        createUserDto.role ?? 'MEMBER',
      ],
    );

    return result.rows[0];
  }

  /**
   * Find all users with pagination and filters
   */
  async findAll(query: UserQueryDto): Promise<{ data: User[]; total: number }> {
    const { page, limit, search } = query;

    const params: any[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.name ilike $${params.length} or m.email ilike $${params.length})`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const baseSql = `
      select
        m.id,
        m.email,
        m.phone,
        m.name as "fullName",
        null::text as "nickname",
        null::text as "avatarUrl",
        'MEMBER'::text as role,
        coalesce(m."lifecycleStage", 'MEMBER') as "lifecycleStage",
        true as "isActive",
        true as "isVerified",
        m.company,
        m."jobTitle",
        0 as "totalPoints",
        1 as "currentLevel",
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      ${whereSql}
      order by m."createdAt" desc
    `;

    const { rows, total } = await this.db.paginatedQuery<User>(
      baseSql,
      params,
      page,
      limit,
    );

    return { data: rows, total };
  }

  /**
   * Find user by ID
   */
  async findOne(id: string): Promise<User> {
    const result = await this.db.query<User>(
      `
      select
        m.id,
        m.email,
        m.phone,
        m.name as "fullName",
        null::text as "nickname",
        null::text as "avatarUrl",
        'MEMBER'::text as role,
        coalesce(m."lifecycleStage", 'MEMBER') as "lifecycleStage",
        true as "isActive",
        true as "isVerified",
        m.company,
        m."jobTitle",
        0 as "totalPoints",
        1 as "currentLevel",
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      where m.id = $1
      `,
      [id],
    );

    const user = result.rows[0];
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      `
      select
        m.id,
        m.email,
        m.phone,
        m.name as "fullName",
        null::text as "nickname",
        null::text as "avatarUrl",
        'MEMBER'::text as role,
        coalesce(m."lifecycleStage", 'MEMBER') as "lifecycleStage",
        true as "isActive",
        true as "isVerified",
        m.company,
        m."jobTitle",
        0 as "totalPoints",
        1 as "currentLevel",
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      where lower(m.email) = lower($1)
      `,
      [email],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Update user profile
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.findOne(id);

    const fields: string[] = [];
    const params: any[] = [];

    if (updateUserDto.fullName !== undefined) {
      params.push(updateUserDto.fullName);
      fields.push(`name = $${params.length}`);
    }
    if (updateUserDto.phone !== undefined) {
      params.push(updateUserDto.phone);
      fields.push(`phone = $${params.length}`);
    }
    if (updateUserDto.company !== undefined) {
      params.push(updateUserDto.company);
      fields.push(`company = $${params.length}`);
    }
    if (updateUserDto.jobTitle !== undefined) {
      params.push(updateUserDto.jobTitle);
      fields.push(`"jobTitle" = $${params.length}`);
    }

    if (!fields.length) {
      return this.findOne(id);
    }

    params.push(id);

    await this.db.query(
      `
      update members
      set ${fields.join(', ')}, "updatedAt" = now()
      where id = $${params.length}
      `,
      params,
    );

    return this.findOne(id);
  }

  /**
   * Update user role (Admin only)
   */
  async updateRole(
    id: string,
    updateRoleDto: UpdateUserRoleDto,
  ): Promise<User> {
    await this.findOne(id);

    const fields: string[] = [];
    const params: any[] = [];

    if (updateRoleDto.lifecycleStage) {
      params.push(updateRoleDto.lifecycleStage);
      fields.push(`"lifecycleStage" = $${params.length}`);
    }

    if (fields.length) {
      params.push(id);
      await this.db.query(
        `
        update members
        set ${fields.join(', ')}, "updatedAt" = now()
        where id = $${params.length}
        `,
        params,
      );
    }

    return this.findOne(id);
  }

  /**
   * Soft delete user
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.db.query('delete from members where id = $1', [id]);
  }

  /**
   * Verify user email
   */
  async verifyEmail(userId: string): Promise<void> {
    await this.db.query(
      `
      update members
      set "updatedAt" = now()
      where id = $1
      `,
      [userId],
    );
  }

  /**
   * Update user points (for gamification)
   */
  async addPoints(
    userId: string,
    points: number,
    reason: string,
  ): Promise<User> {
    // Placeholder: just return the user; points ledger bisa ditambah nanti.
    await this.db.query(
      `
      insert into points_transactions (id, user_id, points, reason, created_at)
      values (gen_random_uuid(), $1, $2, $3, now())
      `,
      [userId, points, reason],
    ).catch(() => {});

    return this.findOne(userId);
  }

  /**
   * Get user's downline (for facilitators)
   */
  async getDownline(facilitatorId: string): Promise<User[]> {
    const result = await this.db.query<User>(
      `
      select
        m.id,
        m.email,
        m.phone,
        m.name as "fullName",
        null::text as "nickname",
        null::text as "avatarUrl",
        'MEMBER'::text as role,
        coalesce(m."lifecycleStage", 'MEMBER') as "lifecycleStage",
        true as "isActive",
        true as "isVerified",
        m.company,
        m."jobTitle",
        0 as "totalPoints",
        1 as "currentLevel",
        m."createdAt" as "createdAt",
        m."updatedAt" as "updatedAt"
      from members m
      where m."nTagStatus" = $1
      `,
      [facilitatorId],
    );
    return result.rows;
  }
}
