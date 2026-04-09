import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MasterDoneTagsService } from './master-done-tags.service';
import {
  CreateMasterDoneTagDto,
  CreateMasterDoneTagDtoSchema,
  MasterDoneTagQueryDto,
  MasterDoneTagQueryDtoSchema,
  UpdateMasterDoneTagDto,
  UpdateMasterDoneTagDtoSchema,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('master-done-tags')
export class MasterDoneTagsController {
  constructor(private readonly service: MasterDoneTagsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateMasterDoneTagDtoSchema))
    dto: CreateMasterDoneTagDto,
  ) {
    assertOperationsOnly(req.user, 'Master done tag creation');
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(MasterDoneTagQueryDtoSchema))
    query: MasterDoneTagQueryDto,
  ) {
    return this.service.findAll(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMasterDoneTagDtoSchema))
    dto: UpdateMasterDoneTagDto,
  ) {
    assertOperationsOnly(req.user, 'Master done tag update');
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOperationsOnly(req.user, 'Master done tag deletion');
    return this.service.remove(id);
  }
}
