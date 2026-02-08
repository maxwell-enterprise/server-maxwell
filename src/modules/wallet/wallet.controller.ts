/**
 * MAXWELL ERP - Wallet Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Delete,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import {
  WalletQueryDtoSchema,
  CreateGiftDtoSchema,
  ClaimGiftDtoSchema,
  RevokeGiftDtoSchema,
  WalletHistoryQueryDtoSchema,
} from './dto';
import type {
  WalletQueryDto,
  CreateGiftDto,
  ClaimGiftDto,
  RevokeGiftDto,
  WalletHistoryQueryDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get my wallet items
   * GET /wallet
   */
  @Get()
  getMyWallet(
    @Query(new ZodValidationPipe(WalletQueryDtoSchema)) query: WalletQueryDto,
  ) {
    const userId = 'temp-user-id'; // TODO: Get from auth
    return this.walletService.getMyWallet(userId, query);
  }

  /**
   * Get wallet item detail
   * GET /wallet/:id
   */
  @Get(':id')
  getWalletItem(@Param('id', ParseUUIDPipe) id: string) {
    const userId = 'temp-user-id';
    return this.walletService.getWalletItem(id, userId);
  }

  /**
   * Get wallet transaction history
   * GET /wallet/history
   */
  @Get('history')
  getHistory(
    @Query(new ZodValidationPipe(WalletHistoryQueryDtoSchema))
    query: WalletHistoryQueryDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.getHistory(userId, query);
  }

  /**
   * Get membership card
   * GET /wallet/card
   */
  @Get('card')
  getMembershipCard() {
    const userId = 'temp-user-id';
    return this.walletService.getMembershipCard(userId);
  }

  // ==========================================================================
  // GIFTING
  // ==========================================================================

  /**
   * Send a gift (transfer ticket)
   * POST /wallet/gifts
   */
  @Post('gifts')
  createGift(
    @Body(new ZodValidationPipe(CreateGiftDtoSchema)) dto: CreateGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.createGift(userId, dto);
  }

  /**
   * Claim a gift
   * POST /wallet/gifts/claim
   */
  @Post('gifts/claim')
  claimGift(
    @Body(new ZodValidationPipe(ClaimGiftDtoSchema)) dto: ClaimGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.claimGift(userId, dto);
  }

  /**
   * Revoke a pending gift
   * DELETE /wallet/gifts/:id
   */
  @Delete('gifts/:id')
  revokeGift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RevokeGiftDtoSchema)) dto: RevokeGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.revokeGift(userId, id, dto);
  }

  /**
   * Get my sent gifts
   * GET /wallet/gifts/sent
   */
  @Get('gifts/sent')
  getSentGifts() {
    const userId = 'temp-user-id';
    return this.walletService.getSentGifts(userId);
  }

  /**
   * Get my received gifts
   * GET /wallet/gifts/received
   */
  @Get('gifts/received')
  getReceivedGifts() {
    const userId = 'temp-user-id';
    return this.walletService.getReceivedGifts(userId);
  }
}
