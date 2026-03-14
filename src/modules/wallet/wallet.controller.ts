/**
 * MAXWELL ERP - Wallet Controller
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';
import {
  ClaimGiftDtoSchema,
  CreateGiftDtoSchema,
  GiftAllocationDtoSchema,
  RevokeGiftDtoSchema,
  TeamMemberDtoSchema,
  TeamMembersQueryDtoSchema,
  UserEntitlementsDtoSchema,
  UpsertWalletItemsBatchDtoSchema,
  WalletHistoryListQueryDtoSchema,
  WalletHistoryQueryDtoSchema,
  WalletItemContractDtoSchema,
  WalletItemsAdminQueryDtoSchema,
  WalletQueryDtoSchema,
  WalletTransactionLogDtoSchema,
} from './dto';
import type {
  ClaimGiftDto,
  CreateGiftDto,
  GiftAllocationDto,
  RevokeGiftDto,
  TeamMemberDto,
  TeamMembersQueryDto,
  UserEntitlementsDto,
  UpsertWalletItemsBatchDto,
  WalletHistoryListQueryDto,
  WalletHistoryQueryDto,
  WalletItemContractDto,
  WalletItemsAdminQueryDto,
  WalletQueryDto,
  WalletTransactionLogDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('entitlements/:userId')
  getUserEntitlements(@Param('userId') userId: string) {
    return this.walletService.getUserEntitlements(userId);
  }

  @Put('entitlements/:userId')
  upsertUserEntitlements(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UserEntitlementsDtoSchema))
    dto: UserEntitlementsDto,
  ) {
    return this.walletService.upsertUserEntitlements({
      ...dto,
      userId,
    });
  }

  @Get('items')
  getWalletItems(
    @Query(new ZodValidationPipe(WalletItemsAdminQueryDtoSchema))
    query: WalletItemsAdminQueryDto,
  ) {
    if (query.userId) {
      return this.walletService.getWalletItemsForUser(query.userId, query.status);
    }

    return this.walletService.getAllWalletItems();
  }

  @Get('items/:id')
  getWalletItemContract(@Param('id') id: string) {
    return this.walletService.getWalletItemContractById(id);
  }

  @Put('items/bulk')
  upsertWalletItems(
    @Body(new ZodValidationPipe(UpsertWalletItemsBatchDtoSchema))
    dto: UpsertWalletItemsBatchDto,
  ) {
    return this.walletService.upsertWalletItems(dto.items);
  }

  @Put('items/:id')
  upsertWalletItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WalletItemContractDtoSchema))
    dto: WalletItemContractDto,
  ) {
    return this.walletService.upsertWalletItem({
      ...dto,
      id,
    });
  }

  @Get('history/list')
  getWalletHistory(
    @Query(new ZodValidationPipe(WalletHistoryListQueryDtoSchema))
    query: WalletHistoryListQueryDto,
  ) {
    return this.walletService.getWalletHistory(query.userId);
  }

  @Post('history')
  logWalletHistory(
    @Body(new ZodValidationPipe(WalletTransactionLogDtoSchema))
    dto: WalletTransactionLogDto,
  ) {
    return this.walletService.logWalletHistory(dto);
  }

  @Get('gift-allocations')
  getGiftAllocations() {
    return this.walletService.getGiftAllocations();
  }

  @Put('gift-allocations/:id')
  upsertGiftAllocation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GiftAllocationDtoSchema))
    dto: GiftAllocationDto,
  ) {
    return this.walletService.upsertGiftAllocation({
      ...dto,
      id,
    });
  }

  @Get('team-members')
  getTeamMembers(
    @Query(new ZodValidationPipe(TeamMembersQueryDtoSchema))
    query: TeamMembersQueryDto,
  ) {
    return this.walletService.getTeamMembers(query.orgId);
  }

  @Put('team-members/:id')
  upsertTeamMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TeamMemberDtoSchema))
    dto: TeamMemberDto,
  ) {
    return this.walletService.upsertTeamMember({
      ...dto,
      id,
    });
  }

  @Delete('team-members/:id')
  deleteTeamMember(@Param('id') id: string) {
    return this.walletService.deleteTeamMember(id);
  }

  @Get('history')
  getHistory(
    @Query(new ZodValidationPipe(WalletHistoryQueryDtoSchema))
    query: WalletHistoryQueryDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.getHistory(userId, query);
  }

  @Get('card')
  getMembershipCard() {
    const userId = 'temp-user-id';
    return this.walletService.getMembershipCard(userId);
  }

  @Post('gifts')
  createGift(
    @Body(new ZodValidationPipe(CreateGiftDtoSchema)) dto: CreateGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.createGift(userId, dto);
  }

  @Post('gifts/claim')
  claimGift(
    @Body(new ZodValidationPipe(ClaimGiftDtoSchema)) dto: ClaimGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.claimGift(userId, dto);
  }

  @Delete('gifts/:id')
  revokeGift(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RevokeGiftDtoSchema)) dto: RevokeGiftDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.revokeGift(userId, id, dto);
  }

  @Get('gifts/sent')
  getSentGifts() {
    const userId = 'temp-user-id';
    return this.walletService.getSentGifts(userId);
  }

  @Get('gifts/received')
  getReceivedGifts() {
    const userId = 'temp-user-id';
    return this.walletService.getReceivedGifts(userId);
  }

  @Get()
  getMyWallet(
    @Query(new ZodValidationPipe(WalletQueryDtoSchema)) query: WalletQueryDto,
  ) {
    const userId = 'temp-user-id';
    return this.walletService.getMyWallet(userId, query);
  }

  @Get(':id')
  getWalletItem(@Param('id') id: string) {
    const userId = 'temp-user-id';
    return this.walletService.getWalletItem(id, userId);
  }
}
