import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, JwtAuthGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}
