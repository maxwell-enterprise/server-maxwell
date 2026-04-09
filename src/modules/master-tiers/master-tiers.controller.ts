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
  Req,
  UseGuards,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('master-tiers')
export class MasterTiersController {
  constructor(private readonly service: MasterTiersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateMasterTierDtoSchema))
    dto: CreateMasterTierDto,
  ) {
    assertOperationsOnly(req.user, 'Master tier creation');
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
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMasterTierDtoSchema))
    dto: UpdateMasterTierDto,
  ) {
    assertOperationsOnly(req.user, 'Master tier update');
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    assertOperationsOnly(req.user, 'Master tier deletion');
    return this.service.remove(id);
  }
}
