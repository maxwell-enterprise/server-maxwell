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
  Req,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  CheckoutDtoSchema,
  TransactionQueryDtoSchema,
  CreateRefundDtoSchema,
  MidtransWebhookDtoSchema,
  PublicTransactionStatusDtoSchema,
} from './dto';
import type {
  CheckoutDto,
  TransactionQueryDto,
  CreateRefundDto,
  MidtransWebhookDto,
  PublicTransactionStatusDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { assertFinanceControllerOnly } from '../../common/security/access-policy';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Checkout / Create transaction
   * POST /transactions/checkout
   */
  @Post('checkout')
  checkout(
    @Body(new ZodValidationPipe(CheckoutDtoSchema)) dto: CheckoutDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = null; // Could be null for guest checkout
    return this.transactionsService.checkout(userId, dto, idempotencyKey);
  }

  /**
   * Create Midtrans Snap token so FE can open the hosted payment page.
   * POST /transactions/midtrans/snap
   */
  @Post('midtrans/snap')
  @RateLimit({ limit: 20, windowMs: 60_000, keyBy: 'guestEmail' })
  midtransSnap(
    @Body(new ZodValidationPipe(CheckoutDtoSchema)) dto: CheckoutDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = null; // guest checkout for this version
    return this.transactionsService.createMidtransSnap(
      userId,
      dto,
      idempotencyKey,
    );
  }

  /**
   * Public-safe transaction status check for guest polling.
   * Requires transactionId + matching receipt email; returns status only.
   */
  @Post('public-status')
  @RateLimit({ limit: 120, windowMs: 60_000, keyBy: 'customerEmail' })
  publicStatus(
    @Body(new ZodValidationPipe(PublicTransactionStatusDtoSchema))
    dto: PublicTransactionStatusDto,
  ) {
    return this.transactionsService.getPublicPaymentStatus(
      dto.transactionId,
      dto.customerEmail,
    );
  }

  /**
   * Get my transactions
   * GET /transactions/my
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  findMyTransactions(
    @Req() req: { user: JwtUserPayload },
    @Query(new ZodValidationPipe(TransactionQueryDtoSchema))
    query: TransactionQueryDto,
  ) {
    const userId = String(req.user.sub);
    return this.transactionsService.findMyTransactions(
      userId,
      String(req.user.role),
      query,
    );
  }

  /**
   * Get all transactions (Admin)
   * GET /transactions
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Req() req: { user: JwtUserPayload },
    @Query(new ZodValidationPipe(TransactionQueryDtoSchema))
    query: TransactionQueryDto,
  ) {
    assertFinanceControllerOnly(req.user, 'Transaction listing');
    return this.transactionsService.findAll(
      String(req.user.sub),
      String(req.user.role),
      query,
    );
  }

  /**
   * Get transaction detail
   * GET /transactions/:id
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.findOneForUser(
      id,
      String(req.user.sub),
      String(req.user.role),
    );
  }

  /**
   * Create refund request
   * POST /transactions/refunds
   */
  @Post('refunds')
  @UseGuards(JwtAuthGuard)
  createRefund(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateRefundDtoSchema)) dto: CreateRefundDto,
  ) {
    assertFinanceControllerOnly(req.user, 'Refund creation');
    return this.transactionsService.createRefund(dto, String(req.user.sub));
  }

  /**
   * Approve refund (Admin)
   * POST /transactions/refunds/:id/approve
   */
  @Post('refunds/:id/approve')
  @UseGuards(JwtAuthGuard)
  approveRefund(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    assertFinanceControllerOnly(req.user, 'Refund approval');
    const approvedBy = String(req.user.sub);
    return this.transactionsService.approveRefund(id, approvedBy);
  }

  /**
   * Process refund (Finance)
   * POST /transactions/refunds/:id/process
   */
  @Post('refunds/:id/process')
  @UseGuards(JwtAuthGuard)
  processRefund(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    assertFinanceControllerOnly(req.user, 'Refund processing');
    return this.transactionsService.processRefund(id, String(req.user.sub));
  }

  /**
   * Get sales summary (Admin)
   * GET /transactions/reports/summary
   */
  @Get('reports/summary')
  @UseGuards(JwtAuthGuard)
  getSalesSummary(
    @Req() req: { user: JwtUserPayload },
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    assertFinanceControllerOnly(req.user, 'Sales summary report');
    return this.transactionsService.getSalesSummary(
      String(req.user.sub),
      String(req.user.role),
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
  @RateLimit({ limit: 240, windowMs: 60_000, keyBy: 'order_id' })
  handleMidtransWebhook(
    @Body(new ZodValidationPipe(MidtransWebhookDtoSchema))
    dto: MidtransWebhookDto,
    @Headers('x-midtrans-signature') _signature: string,
  ) {
    // TODO: Verify signature before processing
    return this.transactionsService.handleMidtransWebhook(dto, _signature);
  }
}
