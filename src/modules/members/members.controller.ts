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
  CreateMemberDto,
  CreateMemberDtoSchema,
  MemberQueryDto,
  MemberQueryDtoSchema,
  UpdateMemberDto,
  UpdateMemberDtoSchema,
} from './dto';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateMemberDtoSchema))
    dto: CreateMemberDto,
  ) {
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
  update(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateMemberDtoSchema))
    dto: UpdateMemberDto,
  ) {
    return this.membersService.update(identifier, dto);
  }
}
