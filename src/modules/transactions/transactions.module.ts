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
import { StoreSupportModule } from '../store-support/store-support.module';
import { AutomationsModule } from '../automations/automations.module';
import { WorkspaceIdentityModule } from '../workspace-identity/workspace-identity.module';

@Module({
  imports: [
    MidtransModule,
    AuthModule,
    WorkspaceIdentityModule,
    MembersModule,
    CampaignsModule,
    WalletModule,
    ProductsModule,
    StoreSupportModule,
    AutomationsModule,
  ],
  controllers: [TransactionsController, WebhooksController],
  providers: [TransactionsService, CheckoutEntitlementsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
