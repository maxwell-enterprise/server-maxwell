import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database';
import { CommunicationEmailController } from './communication-email.controller';
import { CommunicationEmailService } from './communication-email.service';
import { CommunicationWhatsappController } from './communication-whatsapp.controller';
import { CommunicationWhatsappService } from './communication-whatsapp.service';
import { CommunicationPdfController } from './communication-pdf.controller';
import { CommunicationPdfService } from './communication-pdf.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    CommunicationEmailController,
    CommunicationWhatsappController,
    CommunicationPdfController,
  ],
  providers: [
    CommunicationEmailService,
    CommunicationWhatsappService,
    CommunicationPdfService,
  ],
})
export class CommunicationModule {}
