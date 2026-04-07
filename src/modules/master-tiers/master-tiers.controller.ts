import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MasterTiersService } from './master-tiers.service';
import {
  CreateMasterTierDtoSchema,
  UpdateMasterTierDtoSchema,
  MasterTierQueryDtoSchema,
  CreateMasterTierDto,
  UpdateMasterTierDto,
  MasterTierQueryDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('master-tiers')
export class MasterTiersController {
  constructor(private readonly service: MasterTiersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateMasterTierDtoSchema))
    dto: CreateMasterTierDto,
  ) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(MasterTierQueryDtoSchema))
    query: MasterTierQueryDto,
  ) {
    return this.service.findAll(query);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMasterTierDtoSchema))
    dto: UpdateMasterTierDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
