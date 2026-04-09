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
  CreateMemberDto,
  CreateMemberDtoSchema,
  MemberQueryDto,
  MemberQueryDtoSchema,
  UpdateMemberDto,
  UpdateMemberDtoSchema,
} from './dto';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertSalesOnly } from '../../common/security/access-policy';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateMemberDtoSchema))
    dto: CreateMemberDto,
  ) {
    assertSalesOnly(req.user, 'Member registration');
    return this.membersService.create(dto);
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
    assertSalesOnly(req.user, 'Member update');
    return this.membersService.update(identifier, dto);
  }
}
