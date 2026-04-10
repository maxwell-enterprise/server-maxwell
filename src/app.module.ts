/**
 * MAXWELL ERP - Root Application Module
 */
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { parseAppEnv } from './common/config/env.schema';

const appEnv = parseAppEnv(process.env);
const typeOrmPostgresSsl =
  appEnv.DB_SSL || /supabase\.(com|co)/i.test(appEnv.DATABASE_URL ?? '');
const typeOrmPoolMax = (() => {
  const configuredMax = Math.max(1, appEnv.DB_POOL_MAX);
  const rawUrl = appEnv.DATABASE_URL;
  if (!rawUrl) return configuredMax;
  try {
    const url = new URL(rawUrl);
    const connectionLimit = Number(url.searchParams.get('connection_limit'));
    if (!Number.isFinite(connectionLimit) || connectionLimit <= 0) {
      return configuredMax;
    }
    return Math.max(1, Math.min(configuredMax, Math.floor(connectionLimit)));
  } catch {
    return configuredMax;
  }
})();
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
import { CertificationRulesModule } from './modules/certification-rules/certification-rules.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { StoreSupportModule } from './modules/store-support/store-support.module';
import { CommissionRulesModule } from './modules/commission-rules/commission-rules.module';
import { YouthImpactModule } from './modules/youth-impact/youth-impact.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { SystemAdminModule } from './modules/system-admin/system-admin.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CmsModule } from './modules/cms/cms.module';
import { AccountSettingsModule } from './modules/account-settings/account-settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SimpleRateLimitGuard } from './common/security/simple-rate-limit.guard';
// import { AutomationModule } from './modules/automation/automation.module';
// import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(appEnv.DATABASE_URL
        ? { url: appEnv.DATABASE_URL }
        : {
            host: appEnv.DB_HOST,
            port: appEnv.DB_PORT,
            username: appEnv.DB_USERNAME,
            password: appEnv.DB_PASSWORD,
            database: appEnv.DB_DATABASE,
          }),
      ...(typeOrmPostgresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      extra: {
        max: typeOrmPoolMax,
        idleTimeoutMillis: appEnv.DB_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: appEnv.DB_CONNECTION_TIMEOUT_MS,
      },
      autoLoadEntities: true,
      synchronize: false, // true hanya untuk development awal
    }),
    AppConfigModule,

    PrismaModule,

    // Database
    DatabaseModule,

    AuthModule,

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
    CertificationRulesModule,
    ContractsModule,
    StoreSupportModule,
    CommissionRulesModule,
    YouthImpactModule,
    GamificationModule,
    CommunicationModule,
    SystemAdminModule,
    CampaignsModule,
    CmsModule,
    AccountSettingsModule,
  ],
  controllers: [RootController, AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SimpleRateLimitGuard,
    },
  ],
})
export class AppModule {}
