import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CommunicationEmailController } from './communication-email.controller';
import { CommunicationEmailService } from './communication-email.service';
import { CommunicationWhatsappController } from './communication-whatsapp.controller';
import { CommunicationWhatsappService } from './communication-whatsapp.service';
import { CommunicationPdfController } from './communication-pdf.controller';
import { CommunicationPdfService } from './communication-pdf.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    CommunicationEmailController,
    CommunicationWhatsappController,
    CommunicationPdfController,
  ],
  providers: [
    CommunicationEmailService,
    CommunicationWhatsappService,
    CommunicationPdfService,
    JwtAuthGuard,
  ],
  exports: [CommunicationEmailService, CommunicationWhatsappService],
})
export class CommunicationModule {}
