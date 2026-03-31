/**
 * MAXWELL ERP - Root Application Module
 */
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RootController } from './root.controller';

import { AppConfigModule } from './common/config/app-config.module';

// Core DB module
import { DatabaseModule } from './common/database';

// Feature Modules
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { MasterTiersModule } from './modules/master-tiers/master-tiers.module';
import { MasterDoneTagsModule } from './modules/master-done-tags/master-done-tags.module';
import { ProductsModule } from './modules/products/products.module';
import { MembersModule } from './modules/members/members.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { CartsModule } from './modules/carts/carts.module';

// TODO: Add these modules when ready
// import { AuthModule } from './modules/auth/auth.module';
// import { AutomationModule } from './modules/automation/automation.module';
// import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(process.env.DATABASE_URL
        ? { url: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: +(process.env.DB_PORT || 5432),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
          }),
      autoLoadEntities: true,
      synchronize: false, // true hanya untuk development awal
    }),
    AppConfigModule,

    // Database
    DatabaseModule,

    // Core Modules
    UsersModule,
    EventsModule,
    WalletModule,
    TransactionsModule,
    CheckinModule,
    MasterTiersModule,
    MasterDoneTagsModule,
    ProductsModule,
    MembersModule,
    InvitationsModule,
    CartsModule,
  ],
  controllers: [RootController, AppController],
  providers: [AppService],
})
export class AppModule {}
