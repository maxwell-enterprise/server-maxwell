import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StoreSupportService } from './store-support.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertFinanceControllerOnly,
  assertMarketingOnly,
  assertOperationsOnly,
} from '../../common/security/access-policy';

@Controller('store')
export class StoreSupportController {
  constructor(private readonly storeSupport: StoreSupportService) {}

  private assertOps(req: { user: JwtUserPayload }, action: string): void {
    assertOperationsOnly(req.user, action);
  }

  private assertMarketing(req: { user: JwtUserPayload }, action: string): void {
    assertMarketingOnly(req.user, action);
  }

  private assertFinance(req: { user: JwtUserPayload }, action: string): void {
    assertFinanceControllerOnly(req.user, action);
  }

  @Get('pricing-rules')
  listPricingRules() {
    return this.storeSupport.listPricingRules();
  }

  @Put('pricing-rules/:id')
  @UseGuards(JwtAuthGuard)
  upsertPricingRule(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Pricing rule update');
    return this.storeSupport.upsertPricingRule(id, body ?? {});
  }

  @Delete('pricing-rules/:id')
  @UseGuards(JwtAuthGuard)
  deletePricingRule(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    this.assertOps(req, 'Pricing rule deletion');
    return this.storeSupport.deletePricingRule(id);
  }

  @Get('discounts')
  listDiscounts() {
    return this.storeSupport.listDiscounts();
  }

  @Put('discounts/:id')
  @UseGuards(JwtAuthGuard)
  upsertDiscount(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertMarketing(req, 'Discount update');
    return this.storeSupport.upsertDiscount(id, body ?? {});
  }

  @Delete('discounts/:id')
  @UseGuards(JwtAuthGuard)
  deleteDiscount(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    this.assertMarketing(req, 'Discount deletion');
    return this.storeSupport.deleteDiscount(id);
  }

  @Get('inventory')
  listInventory() {
    return this.storeSupport.listInventory();
  }

  @Put('inventory/:sku')
  @UseGuards(JwtAuthGuard)
  upsertInventory(
    @Req() req: { user: JwtUserPayload },
    @Param('sku') sku: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Inventory update');
    return this.storeSupport.upsertInventory(decodeURIComponent(sku), body ?? {});
  }

  @Get('inventory-transactions')
  listInventoryTransactions(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    return this.storeSupport.listInventoryTransactions(
      Number.isFinite(n) ? n : 200,
    );
  }

  @Post('inventory-transactions')
  @UseGuards(JwtAuthGuard)
  createInventoryTransaction(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Inventory transaction creation');
    return this.storeSupport.createInventoryTransaction(body ?? {});
  }

  @Get('ops-templates')
  listOpsTemplates() {
    return this.storeSupport.listOpsTemplates();
  }

  @Put('ops-templates/:id')
  @UseGuards(JwtAuthGuard)
  upsertOpsTemplate(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Ops template update');
    return this.storeSupport.upsertOpsTemplate(decodeURIComponent(id), body ?? {});
  }

  @Delete('ops-templates/:id')
  @UseGuards(JwtAuthGuard)
  deleteOpsTemplate(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    this.assertOps(req, 'Ops template deletion');
    return this.storeSupport.deleteOpsTemplate(decodeURIComponent(id));
  }

  @Get('ops-checklists')
  listOpsChecklists() {
    return this.storeSupport.listOpsChecklists();
  }

  @Get('ops-checklists/lookup/:id')
  getOpsChecklist(@Param('id') id: string) {
    return this.storeSupport.getOpsChecklistByFeId(decodeURIComponent(id));
  }

  @Put('ops-checklists/:id')
  @UseGuards(JwtAuthGuard)
  upsertOpsChecklist(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Ops checklist update');
    return this.storeSupport.upsertOpsChecklist(decodeURIComponent(id), body ?? {});
  }

  @Get('finance-forecast')
  financeForecast() {
    return this.storeSupport.getFinanceForecastSummary();
  }

  @Get('ledger-transactions')
  listLedgerTransactions(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.storeSupport.findLedgerTransactions({
      type,
      status,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('ledger-transactions')
  @UseGuards(JwtAuthGuard)
  createLedgerTransaction(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertFinance(req, 'Ledger transaction creation');
    return this.storeSupport.createLedgerTransaction(body ?? {});
  }

  @Patch('ledger-transactions/:id/status')
  @UseGuards(JwtAuthGuard)
  async patchLedgerStatus(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    this.assertFinance(req, 'Ledger status update');
    const allowed = ['Pending', 'Approved', 'Paid'] as const;
    if (!allowed.includes(status as (typeof allowed)[number])) {
      throw new BadRequestException(
        `status must be one of: ${allowed.join(', ')}`,
      );
    }
    await this.storeSupport.updateLedgerStatus(
      decodeURIComponent(id),
      status as (typeof allowed)[number],
    );
    return { ok: true };
  }

  @Get('payout-transactions')
  listPayouts() {
    return this.storeSupport.listPayouts();
  }

  @Patch('payout-transactions/:id/status')
  @UseGuards(JwtAuthGuard)
  async patchPayoutStatus(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    this.assertFinance(req, 'Payout status update');
    const allowed = ['PENDING', 'PAID', 'APPROVED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `status must be one of: ${allowed.join(', ')}`,
      );
    }
    await this.storeSupport.updatePayoutStatus(id, status);
    return { ok: true };
  }

  @Patch('payment-transactions/:id/settle')
  @UseGuards(JwtAuthGuard)
  async settlePayment(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertFinance(req, 'Payment settlement');
    await this.storeSupport.settlePaymentTransaction(id);
    return { ok: true };
  }

  @Post('payment-transactions/:id/refund')
  @UseGuards(JwtAuthGuard)
  async recordPaymentRefund(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount: number; reason?: string },
  ) {
    this.assertFinance(req, 'Payment refund');
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    await this.storeSupport.recordPaymentRefund(
      id,
      amount,
      String(body?.reason ?? 'Refund'),
    );
    return { ok: true };
  }

  @Get('support-tickets')
  listSupportTickets() {
    return this.storeSupport.listSupportTickets();
  }

  @Post('support-tickets')
  @UseGuards(JwtAuthGuard)
  createSupportTicket(
    @Req() req: { user: JwtUserPayload },
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Support ticket creation');
    return this.storeSupport.createSupportTicket(body ?? {});
  }

  @Patch('support-tickets/:id')
  @UseGuards(JwtAuthGuard)
  async patchSupportTicket(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertOps(req, 'Support ticket update');
    await this.storeSupport.updateSupportTicket(decodeURIComponent(id), body ?? {});
    return { ok: true };
  }

  @Post('support-tickets/:id/resolve')
  @UseGuards(JwtAuthGuard)
  async resolveSupportTicket(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: { resolution?: string },
  ) {
    this.assertOps(req, 'Support ticket resolution');
    await this.storeSupport.resolveSupportTicket(
      decodeURIComponent(id),
      String(body?.resolution ?? ''),
    );
    return { ok: true };
  }
}
