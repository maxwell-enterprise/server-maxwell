import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppConfigService } from '../../common/config/app-config.service';
import { CreateMemberDto, CreateMemberDtoSchema } from './dto';
import { MembersService } from './members.service';

/**
 * Trusted server-to-server member creation (e.g. NextAuth sign-in → CRM row).
 * Not callable from the browser without the shared secret (never expose the key in NEXT_PUBLIC_*).
 */
@Controller('internal/members')
export class InternalMembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly config: AppConfigService,
  ) {}

  @Post('sync')
  syncFromTrustedServer(
    @Headers('x-internal-key') key: string | undefined,
    @Body(new ZodValidationPipe(CreateMemberDtoSchema)) dto: CreateMemberDto,
  ) {
    const expected = this.config.internalMemberSyncKey;
    if (!expected) {
      throw new NotFoundException();
    }
    if (!key || key !== expected) {
      throw new ForbiddenException();
    }
    return this.membersService.create(dto);
  }
}
