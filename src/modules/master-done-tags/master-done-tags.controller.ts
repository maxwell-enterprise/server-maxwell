import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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

@Controller('master-done-tags')
export class MasterDoneTagsController {
  constructor(private readonly service: MasterDoneTagsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateMasterDoneTagDtoSchema))
    dto: CreateMasterDoneTagDto,
  ) {
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
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMasterDoneTagDtoSchema))
    dto: UpdateMasterDoneTagDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
