import {
  BadRequestException,
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
  CreateMemberDto,
  CreateMemberDtoSchema,
  MemberQueryDto,
  MemberQueryDtoSchema,
  PublicScoutLeadDto,
  PublicScoutLeadDtoSchema,
  UpdateMemberDto,
  UpdateMemberDtoSchema,
} from './dto';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  assertCrmMembersResourceAccess,
  assertCrmFacilitatorAssignmentAccess,
} from '../../common/security/access-policy';
import { parseAppRoleString, USER_ROLE } from '../workspace-identity/user-role.constants';
import { ForbiddenException } from '@nestjs/common';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('public/scout-leads')
  createPublicScoutLead(
    @Body(new ZodValidationPipe(PublicScoutLeadDtoSchema))
    dto: PublicScoutLeadDto,
  ) {
    return this.membersService.createPublicScoutLead(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateMemberDtoSchema))
    dto: CreateMemberDto,
  ) {
    const role = parseAppRoleString(req.user?.role);
    const customAccessAllowed = (() => {
      try {
        assertCrmMembersResourceAccess(req.user, 'Member registration');
        return true;
      } catch {
        return false;
      }
    })();
    const roleAllowed =
      role === USER_ROLE.SALES || role === USER_ROLE.SUPER_ADMIN || customAccessAllowed;
    const lifecycleAllowed = req.user?.email
      ? await this.membersService.hasLifecycleAtLeastByEmail(
          req.user.email,
          'FACILITATOR',
        )
      : false;
    if (!roleAllowed && !lifecycleAllowed) {
      throw new ForbiddenException(
        'Member registration requires Sales or Super Admin role, or CRM lifecycle FACILITATOR',
      );
    }
    const finalDto =
      lifecycleAllowed && !dto.nTagStatus?.trim()
        ? {
            ...dto,
            nTagStatus: req.user.sub,
          }
        : dto;
    return this.membersService.create(finalDto);
  }

  @Post('me/referral/claim')
  @UseGuards(JwtAuthGuard)
  async claimReferral(
    @Req() req: { user: JwtUserPayload },
    @Body() body: { ref?: string },
  ) {
    const ref = typeof body?.ref === 'string' ? body.ref.trim() : '';
    if (!ref) {
      throw new BadRequestException('ref required');
    }
    return this.membersService.claimReferralForEmail(req.user.email, ref);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(MemberQueryDtoSchema))
    query: MemberQueryDto,
  ) {
    return this.membersService.findAll(query);
  }

  @Get(':identifier')
  findOne(@Param('identifier') identifier: string) {
    return this.membersService.findOne(identifier);
  }

  @Patch(':identifier')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateMemberDtoSchema))
    dto: UpdateMemberDto,
  ) {
    if (
      dto.facilitatorName !== undefined ||
      dto.facilitatorType !== undefined
    ) {
      assertCrmFacilitatorAssignmentAccess(
        req.user,
        'Facilitator assignment update',
      );
    }
    assertCrmMembersResourceAccess(req.user, 'Member update');
    return this.membersService.update(identifier, dto, {
      preserveExplicitFacilitatorType: false,
    });
  }
}
