/**
 * MAXWELL ERP - Transactions Module
 */

import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { MidtransModule } from '../midtrans/midtrans.module';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import {
  TransactionsController,
  WebhooksController,
} from './transactions.controller';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { WalletModule } from '../wallet/wallet.module';
import { ProductsModule } from '../products/products.module';
import { CheckoutEntitlementsService } from './checkout-entitlements.service';

@Module({
  imports: [
    MidtransModule,
    AuthModule,
    MembersModule,
    CampaignsModule,
    WalletModule,
    ProductsModule,
  ],
  controllers: [TransactionsController, WebhooksController],
  providers: [TransactionsService, CheckoutEntitlementsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
