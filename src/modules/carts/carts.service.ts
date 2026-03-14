import { Injectable } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { ActiveCartDto } from './dto';

interface CartRow {
  sessionId: string;
  userId: string | null;
  userEmail: string | null;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }> | null;
  lastUpdated: string | Date;
  totalValue: string | number;
  status: 'ACTIVE' | 'ABANDONED' | 'CONVERTED';
}

@Injectable()
export class CartsService {
  constructor(private readonly db: DbService) {}

  async syncCart(dto: ActiveCartDto): Promise<void> {
    await this.db.query(
      `
      insert into active_shopping_carts (
        "sessionId",
        "userId",
        "userEmail",
        items,
        "lastUpdated",
        "totalValue",
        status
      )
      values (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5::timestamptz,
        $6,
        $7
      )
      on conflict ("sessionId") do update
      set "userId" = excluded."userId",
          "userEmail" = excluded."userEmail",
          items = excluded.items,
          "lastUpdated" = excluded."lastUpdated",
          "totalValue" = excluded."totalValue",
          status = excluded.status
      `,
      [
        dto.sessionId,
        dto.userId ?? null,
        dto.userEmail ?? null,
        JSON.stringify(dto.items),
        new Date(dto.lastUpdated).toISOString(),
        dto.totalValue,
        dto.status,
      ],
    );
  }

  async getCarts(): Promise<ActiveCartDto[]> {
    const result = await this.db.query<CartRow>(
      `
      select
        "sessionId" as "sessionId",
        "userId" as "userId",
        "userEmail" as "userEmail",
        items,
        "lastUpdated" as "lastUpdated",
        "totalValue" as "totalValue",
        status
      from active_shopping_carts
      order by "lastUpdated" desc
      `,
    );

    return result.rows.map((row) => this.toCart(row));
  }

  async getCartBySession(sessionId: string): Promise<ActiveCartDto | null> {
    const result = await this.db.query<CartRow>(
      `
      select
        "sessionId" as "sessionId",
        "userId" as "userId",
        "userEmail" as "userEmail",
        items,
        "lastUpdated" as "lastUpdated",
        "totalValue" as "totalValue",
        status
      from active_shopping_carts
      where "sessionId" = $1
      limit 1
      `,
      [sessionId],
    );

    return result.rows[0] ? this.toCart(result.rows[0]) : null;
  }

  private toCart(row: CartRow): ActiveCartDto {
    return {
      sessionId: row.sessionId,
      userId: row.userId ?? undefined,
      userEmail: row.userEmail ?? undefined,
      items: Array.isArray(row.items) ? row.items : [],
      lastUpdated:
        row.lastUpdated instanceof Date
          ? row.lastUpdated.toISOString()
          : row.lastUpdated,
      totalValue: Number(row.totalValue ?? 0),
      status: row.status,
    };
  }
}
