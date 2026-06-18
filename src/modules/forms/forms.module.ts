import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule],
  controllers: [FormsController],
  providers: [FormsService, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class FormsModule {}
