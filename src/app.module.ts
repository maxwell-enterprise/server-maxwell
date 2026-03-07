/**
 * MAXWELL ERP - Root Application Module
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Core DB module
import { DbModule } from './common/db.module';

// Feature Modules
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { MasterTiersModule } from './modules/master-tiers/master-tiers.module';

// TODO: Add these modules when ready
// import { AuthModule } from './modules/auth/auth.module';
// import { ProductsModule } from './modules/products/products.module';
// import { AutomationModule } from './modules/automation/automation.module';
// import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [
    // Database
    DbModule,

    // Core Modules
    UsersModule,
    EventsModule,
    WalletModule,
    TransactionsModule,
    CheckinModule,
    MasterTiersModule,

    // TODO: Add ConfigModule for environment variables
    // ConfigModule.forRoot({ isGlobal: true }),

    // TODO: Add Database Module (Prisma or TypeORM)
    // DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
