import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  createMany(
    @Body(new ZodValidationPipe(CreateInvitationsBatchDtoSchema))
    dto: CreateInvitationsBatchDto,
  ) {
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
  update(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateInvitationDtoSchema))
    dto: UpdateInvitationDto,
  ) {
    return this.invitationsService.update(identifier, dto);
  }
}
