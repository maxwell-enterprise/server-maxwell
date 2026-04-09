/**
 * MAXWELL ERP - Wallet Module
 */

import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [WalletService, JwtAuthGuard],
  exports: [WalletService],
})
export class WalletModule {}
