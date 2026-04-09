/**
 * MAXWELL ERP - Wallet Controller
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertOperationsOnly,
  assertFinanceControllerOnly,
} from '../../common/security/access-policy';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('entitlements/:userId')
  getUserEntitlements(@Param('userId') userId: string) {
    return this.walletService.getUserEntitlements(userId);
  }

  @Put('entitlements/:userId')
  @UseGuards(JwtAuthGuard)
  upsertUserEntitlements(
    @Req() req: { user: JwtUserPayload },
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UserEntitlementsDtoSchema))
    dto: UserEntitlementsDto,
  ) {
    assertOperationsOnly(req.user, 'Wallet entitlement upsert');
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
      return this.walletService.getWalletItemsForUser(
        query.userId,
        query.status,
      );
    }

    return this.walletService.getAllWalletItems();
  }

  @Get('items/:id')
  getWalletItemContract(@Param('id') id: string) {
    return this.walletService.getWalletItemContractById(id);
  }

  @Put('items/bulk')
  @UseGuards(JwtAuthGuard)
  upsertWalletItems(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(UpsertWalletItemsBatchDtoSchema))
    dto: UpsertWalletItemsBatchDto,
  ) {
    assertOperationsOnly(req.user, 'Wallet items bulk upsert');
    return this.walletService.upsertWalletItems(dto.items);
  }

  @Put('items/:id')
  @UseGuards(JwtAuthGuard)
  upsertWalletItem(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WalletItemContractDtoSchema))
    dto: WalletItemContractDto,
  ) {
    assertOperationsOnly(req.user, 'Wallet item upsert');
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
  @UseGuards(JwtAuthGuard)
  logWalletHistory(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(WalletTransactionLogDtoSchema))
    dto: WalletTransactionLogDto,
  ) {
    assertFinanceControllerOnly(req.user, 'Wallet history write');
    return this.walletService.logWalletHistory(dto);
  }

  @Get('gift-allocations')
  getGiftAllocations() {
    return this.walletService.getGiftAllocations();
  }

  @Put('gift-allocations/:id')
  @UseGuards(JwtAuthGuard)
  upsertGiftAllocation(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GiftAllocationDtoSchema))
    dto: GiftAllocationDto,
  ) {
    assertOperationsOnly(req.user, 'Gift allocation upsert');
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
  @UseGuards(JwtAuthGuard)
  upsertTeamMember(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TeamMemberDtoSchema))
    dto: TeamMemberDto,
  ) {
    assertOperationsOnly(req.user, 'Team member upsert');
    return this.walletService.upsertTeamMember({
      ...dto,
      id,
    });
  }

  @Delete('team-members/:id')
  @UseGuards(JwtAuthGuard)
  deleteTeamMember(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    assertOperationsOnly(req.user, 'Team member deletion');
    return this.walletService.deleteTeamMember(id);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getHistory(
    @Req() req: { user: JwtUserPayload },
    @Query(new ZodValidationPipe(WalletHistoryQueryDtoSchema))
    query: WalletHistoryQueryDto,
  ) {
    const userId = String(req.user.sub);
    return this.walletService.getHistory(userId, query);
  }

  @Get('card')
  @UseGuards(JwtAuthGuard)
  getMembershipCard(@Req() req: { user: JwtUserPayload }) {
    const userId = String(req.user.sub);
    return this.walletService.getMembershipCard(userId);
  }

  @Post('gifts')
  @UseGuards(JwtAuthGuard)
  createGift(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateGiftDtoSchema)) dto: CreateGiftDto,
  ) {
    const userId = String(req.user.sub);
    return this.walletService.createGift(userId, dto);
  }

  @Post('gifts/claim')
  @UseGuards(JwtAuthGuard)
  claimGift(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(ClaimGiftDtoSchema)) dto: ClaimGiftDto,
  ) {
    const userId = String(req.user.sub);
    return this.walletService.claimGift(userId, dto);
  }

  @Delete('gifts/:id')
  @UseGuards(JwtAuthGuard)
  revokeGift(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RevokeGiftDtoSchema)) dto: RevokeGiftDto,
  ) {
    const userId = String(req.user.sub);
    return this.walletService.revokeGift(userId, id, dto);
  }

  @Get('gifts/sent')
  @UseGuards(JwtAuthGuard)
  getSentGifts(@Req() req: { user: JwtUserPayload }) {
    const userId = String(req.user.sub);
    return this.walletService.getSentGifts(userId);
  }

  @Get('gifts/received')
  @UseGuards(JwtAuthGuard)
  getReceivedGifts(@Req() req: { user: JwtUserPayload }) {
    const userId = String(req.user.sub);
    return this.walletService.getReceivedGifts(userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getMyWallet(
    @Req() req: { user: JwtUserPayload },
    @Query(new ZodValidationPipe(WalletQueryDtoSchema)) query: WalletQueryDto,
  ) {
    const userId = String(req.user.sub);
    return this.walletService.getMyWallet(userId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getWalletItem(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    const userId = String(req.user.sub);
    return this.walletService.getWalletItem(id, userId);
  }
}
