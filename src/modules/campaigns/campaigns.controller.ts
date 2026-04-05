import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import {
  BulkCampaignsDto,
  BulkCampaignsDtoSchema,
  CreateCampaignDto,
  CreateCampaignDtoSchema,
  TrackClickDto,
  TrackClickDtoSchema,
  TrackConversionDto,
  TrackConversionDtoSchema,
  UpdateCampaignDto,
  UpdateCampaignDtoSchema,
} from './dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll() {
    return this.campaignsService.findAll();
  }

  @Post('track-click')
  trackClick(
    @Body(new ZodValidationPipe(TrackClickDtoSchema))
    dto: TrackClickDto,
  ) {
    return this.campaignsService.trackClick(dto);
  }

  @Post('track-conversion')
  trackConversion(
    @Body(new ZodValidationPipe(TrackConversionDtoSchema))
    dto: TrackConversionDto,
  ) {
    return this.campaignsService.trackConversion(dto);
  }

  @Post('bulk')
  bulkUpsert(
    @Body(new ZodValidationPipe(BulkCampaignsDtoSchema))
    dto: BulkCampaignsDto,
  ) {
    return this.campaignsService.bulkUpsert(dto);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateCampaignDtoSchema))
    dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCampaignDtoSchema))
    dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, dto);
  }
}
