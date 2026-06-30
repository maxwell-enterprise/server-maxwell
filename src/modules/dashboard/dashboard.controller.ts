import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertWorkspaceStaffOnly,
  hasFinanceInvoiceReadAccess,
} from '../../common/security/access-policy';
import { DashboardService } from './dashboard.service';
import {
  ExecutiveDashboardQueryDto,
  ExecutiveDashboardQuerySchema,
} from './dto/executive-dashboard-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Executive Dashboard KPIs from `members` + `payment_transactions` (PAID).
   * Filters: timeRange, program, region apply to member metrics and finance (via member join).
   */
  @Get('executive')
  @UseGuards(JwtAuthGuard)
  executive(
    @Req() req: { user: JwtUserPayload },
    @Query(new ZodValidationPipe(ExecutiveDashboardQuerySchema))
    query: ExecutiveDashboardQueryDto,
  ) {
    assertWorkspaceStaffOnly(req.user, 'Executive dashboard');
    return this.dashboardService.getExecutiveSummary(query, {
      includeMembers: true,
      includeFinance: hasFinanceInvoiceReadAccess(req.user),
    });
  }
}
