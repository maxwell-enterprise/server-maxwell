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
} from '@nestjs/common';
import { StoreSupportService } from './store-support.service';

@Controller('store')
export class StoreSupportController {
  constructor(private readonly storeSupport: StoreSupportService) {}

  @Get('pricing-rules')
  listPricingRules() {
    return this.storeSupport.listPricingRules();
  }

  @Put('pricing-rules/:id')
  upsertPricingRule(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.upsertPricingRule(id, body ?? {});
  }

  @Delete('pricing-rules/:id')
  deletePricingRule(@Param('id') id: string) {
    return this.storeSupport.deletePricingRule(id);
  }

  @Get('discounts')
  listDiscounts() {
    return this.storeSupport.listDiscounts();
  }

  @Put('discounts/:id')
  upsertDiscount(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.upsertDiscount(id, body ?? {});
  }

  @Delete('discounts/:id')
  deleteDiscount(@Param('id') id: string) {
    return this.storeSupport.deleteDiscount(id);
  }

  @Get('inventory')
  listInventory() {
    return this.storeSupport.listInventory();
  }

  @Put('inventory/:sku')
  upsertInventory(
    @Param('sku') sku: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.upsertInventory(
      decodeURIComponent(sku),
      body ?? {},
    );
  }

  @Get('inventory-transactions')
  listInventoryTransactions(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    return this.storeSupport.listInventoryTransactions(
      Number.isFinite(n) ? n : 200,
    );
  }

  @Post('inventory-transactions')
  createInventoryTransaction(@Body() body: Record<string, unknown>) {
    return this.storeSupport.createInventoryTransaction(body ?? {});
  }

  @Get('ops-templates')
  listOpsTemplates() {
    return this.storeSupport.listOpsTemplates();
  }

  @Put('ops-templates/:id')
  upsertOpsTemplate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.upsertOpsTemplate(
      decodeURIComponent(id),
      body ?? {},
    );
  }

  @Delete('ops-templates/:id')
  deleteOpsTemplate(@Param('id') id: string) {
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
  upsertOpsChecklist(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.upsertOpsChecklist(
      decodeURIComponent(id),
      body ?? {},
    );
  }

  @Patch('ops-checklists/:id/tasks/:taskId/status')
  patchOpsTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body()
    body: {
      status?: string;
      actorRole?: string;
      note?: string;
    },
  ) {
    return this.storeSupport.updateOpsTaskStatus(
      decodeURIComponent(id),
      decodeURIComponent(taskId),
      {
        status: body?.status,
        actorRole: body?.actorRole,
        note: body?.note,
      },
    );
  }

  @Get('support-tickets')
  listSupportTickets(
    @Query('assignedRole') assignedRole?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.storeSupport.listSupportTickets({
      assignedRole,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('support-tickets')
  createSupportTicket(@Body() body: Record<string, unknown>) {
    return this.storeSupport.createSupportTicket(body ?? {});
  }

  @Patch('support-tickets/:id')
  patchSupportTicket(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.storeSupport.updateSupportTicket(
      decodeURIComponent(id),
      body ?? {},
    );
  }

  @Post('support-tickets/:id/resolve')
  resolveSupportTicket(
    @Param('id') id: string,
    @Body() body: { resolution?: string },
  ) {
    return this.storeSupport.resolveSupportTicket(decodeURIComponent(id), {
      resolution: body?.resolution,
    });
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
  createLedgerTransaction(@Body() body: Record<string, unknown>) {
    return this.storeSupport.createLedgerTransaction(body ?? {});
  }

  @Patch('ledger-transactions/:id/status')
  async patchLedgerStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
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
  async patchPayoutStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
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
  async settlePayment(@Param('id', ParseUUIDPipe) id: string) {
    await this.storeSupport.settlePaymentTransaction(id);
    return { ok: true };
  }

  @Post('payment-transactions/:id/refund')
  async recordPaymentRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount: number; reason?: string },
  ) {
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
}
