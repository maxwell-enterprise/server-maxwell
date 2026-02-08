/**
 * MAXWELL ERP - Transactions Module
 */

import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  TransactionsController,
  WebhooksController,
} from './transactions.controller';
// import { WalletModule } from '../wallet/wallet.module';

@Module({
  // imports: [WalletModule],
  controllers: [TransactionsController, WebhooksController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
