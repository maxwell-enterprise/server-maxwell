import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AcceptInvitationDto,
  AcceptInvitationDtoSchema,
  CreateInvitationsBatchDto,
  CreateInvitationsBatchDtoSchema,
  DeclineInvitationDto,
  DeclineInvitationDtoSchema,
  InvitationQueryDto,
  InvitationQueryDtoSchema,
  UpdateInvitationDto,
  UpdateInvitationDtoSchema,
} from './dto';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertSalesOnly } from '../../common/security/access-policy';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  findAll(
    @Query(new ZodValidationPipe(InvitationQueryDtoSchema))
    query: InvitationQueryDto,
  ) {
    return this.invitationsService.findAll(query);
  }

  @Get('member/:memberIdentifier')
  findByMember(@Param('memberIdentifier') memberIdentifier: string) {
    return this.invitationsService.findByMember(memberIdentifier);
  }

  @Get(':identifier')
  findOne(@Param('identifier') identifier: string) {
    return this.invitationsService.findOne(identifier);
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard)
  createMany(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateInvitationsBatchDtoSchema))
    dto: CreateInvitationsBatchDto,
  ) {
    assertSalesOnly(req.user, 'Bulk invitation creation');
    return this.invitationsService.createMany(dto.invitations);
  }

  @Post(':identifier/accept')
  accept(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(AcceptInvitationDtoSchema))
    dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.accept(identifier, dto);
  }

  @Post(':identifier/decline')
  decline(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(DeclineInvitationDtoSchema))
    dto: DeclineInvitationDto,
  ) {
    return this.invitationsService.decline(identifier, dto);
  }

  @Patch(':identifier')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateInvitationDtoSchema))
    dto: UpdateInvitationDto,
  ) {
    assertSalesOnly(req.user, 'Invitation update');
    return this.invitationsService.update(identifier, dto);
  }
}
