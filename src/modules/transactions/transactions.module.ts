/**
 * MAXWELL ERP - Transactions Module
 */

import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { MidtransModule } from '../midtrans/midtrans.module';
import { AuthModule } from '../auth/auth.module';
import {
  TransactionsController,
  WebhooksController,
} from './transactions.controller';
// import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [MidtransModule, AuthModule],
  controllers: [TransactionsController, WebhooksController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
