/**
 * MAXWELL ERP - Transactions Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Headers,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  CheckoutDtoSchema,
  TransactionQueryDtoSchema,
  CreateRefundDtoSchema,
  MidtransWebhookDtoSchema,
} from './dto';
import type {
  CheckoutDto,
  TransactionQueryDto,
  CreateRefundDto,
  MidtransWebhookDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Checkout / Create transaction
   * POST /transactions/checkout
   */
  @Post('checkout')
  checkout(@Body(new ZodValidationPipe(CheckoutDtoSchema)) dto: CheckoutDto) {
    const userId = null; // Could be null for guest checkout
    return this.transactionsService.checkout(userId, dto);
  }

  /**
   * Get my transactions
   * GET /transactions/my
   */
  @Get('my')
  findMyTransactions(
    @Query(new ZodValidationPipe(TransactionQueryDtoSchema))
    query: TransactionQueryDto,
  ) {
    const userId = 'temp-user-id';
    return this.transactionsService.findMyTransactions(userId, query);
  }

  /**
   * Get all transactions (Admin)
   * GET /transactions
   */
  @Get()
  findAll(
    @Query(new ZodValidationPipe(TransactionQueryDtoSchema))
    query: TransactionQueryDto,
  ) {
    return this.transactionsService.findAll(query);
  }

  /**
   * Get transaction detail
   * GET /transactions/:id
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.findOne(id);
  }

  /**
   * Create refund request
   * POST /transactions/refunds
   */
  @Post('refunds')
  createRefund(
    @Body(new ZodValidationPipe(CreateRefundDtoSchema)) dto: CreateRefundDto,
  ) {
    return this.transactionsService.createRefund(dto);
  }

  /**
   * Approve refund (Admin)
   * POST /transactions/refunds/:id/approve
   */
  @Post('refunds/:id/approve')
  approveRefund(@Param('id', ParseUUIDPipe) id: string) {
    const approvedBy = 'temp-admin-id';
    return this.transactionsService.approveRefund(id, approvedBy);
  }

  /**
   * Process refund (Finance)
   * POST /transactions/refunds/:id/process
   */
  @Post('refunds/:id/process')
  processRefund(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.processRefund(id);
  }

  /**
   * Get sales summary (Admin)
   * GET /transactions/reports/summary
   */
  @Get('reports/summary')
  getSalesSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.transactionsService.getSalesSummary(
      new Date(startDate),
      new Date(endDate),
    );
  }
}

/**
 * Midtrans Webhook Controller (separate for security)
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Midtrans payment notification
   * POST /webhooks/midtrans
   */
  @Post('midtrans')
  handleMidtransWebhook(
    @Body(new ZodValidationPipe(MidtransWebhookDtoSchema))
    dto: MidtransWebhookDto,
    @Headers('x-midtrans-signature') _signature: string,
  ) {
    // TODO: Verify signature before processing
    return this.transactionsService.handleMidtransWebhook(dto);
  }
}
