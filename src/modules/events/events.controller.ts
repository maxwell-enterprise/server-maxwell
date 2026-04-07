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
import { EventsRuntimeService } from './events.runtime.service';
import {
  CreateAccessRuleDto,
  CreateAccessRuleDtoSchema,
  CreateAccessTagDto,
  CreateAccessTagDtoSchema,
  CreateEventDto,
  CreateEventDtoSchema,
  CreateGateDto,
  CreateGateDtoSchema,
  CreateTierDto,
  CreateTierDtoSchema,
  EventQueryDto,
  EventQueryDtoSchema,
  UpdateAccessTagDto,
  UpdateAccessTagDtoSchema,
  UpdateEventDto,
  UpdateEventDtoSchema,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsRuntimeService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateEventDtoSchema)) dto: CreateEventDto,
  ) {
    return this.eventsService.create(dto);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(EventQueryDtoSchema)) query: EventQueryDto,
  ) {
    return this.eventsService.findAll(query);
  }

  @Get(':identifier')
  findOne(@Param('identifier') identifier: string) {
    return this.eventsService.findOne(identifier);
  }

  @Patch(':identifier')
  update(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateEventDtoSchema)) dto: UpdateEventDto,
  ) {
    return this.eventsService.update(identifier, dto);
  }

  @Delete(':identifier')
  remove(@Param('identifier') identifier: string) {
    return this.eventsService.remove(identifier);
  }

  @Patch(':identifier/status')
  updateStatus(
    @Param('identifier') identifier: string,
    @Body('status') status: string,
  ) {
    return this.eventsService.updateStatus(identifier, status);
  }

  @Post(':eventIdentifier/tiers')
  createTier(
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateTierDtoSchema)) dto: CreateTierDto,
  ) {
    return this.eventsService.createTier(eventIdentifier, dto);
  }

  @Get(':eventIdentifier/tiers')
  findTiers(@Param('eventIdentifier') eventIdentifier: string) {
    return this.eventsService.findTiers(eventIdentifier);
  }

  @Post(':eventIdentifier/gates')
  createGate(
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateGateDtoSchema)) dto: CreateGateDto,
  ) {
    return this.eventsService.createGate(eventIdentifier, dto);
  }

  @Get(':eventIdentifier/gates')
  findGates(@Param('eventIdentifier') eventIdentifier: string) {
    return this.eventsService.findGates(eventIdentifier);
  }

  @Post(':eventIdentifier/access-rules')
  createAccessRule(
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateAccessRuleDtoSchema))
    dto: CreateAccessRuleDto,
  ) {
    return this.eventsService.createAccessRule({
      ...dto,
      eventId: eventIdentifier,
    });
  }

  @Get(':eventIdentifier/access-rules')
  findAccessRules(@Param('eventIdentifier') eventIdentifier: string) {
    return this.eventsService.findAccessRules(eventIdentifier);
  }

  @Get(':identifier/children')
  getChildEvents(@Param('identifier') identifier: string) {
    return this.eventsService.getChildEvents(identifier);
  }

  @Get(':identifier/attendance')
  getAttendanceSummary(@Param('identifier') identifier: string) {
    return this.eventsService.getAttendanceSummary(identifier);
  }
}

@Controller('access-tags')
export class AccessTagsController {
  constructor(private readonly eventsService: EventsRuntimeService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateAccessTagDtoSchema))
    dto: CreateAccessTagDto,
  ) {
    return this.eventsService.createTag(dto);
  }

  @Get()
  findAll() {
    return this.eventsService.findAllTags();
  }

  @Patch(':tagIdentifier')
  update(
    @Param('tagIdentifier') tagIdentifier: string,
    @Body(new ZodValidationPipe(UpdateAccessTagDtoSchema))
    dto: UpdateAccessTagDto,
  ) {
    return this.eventsService.updateTag(tagIdentifier, dto);
  }

  @Delete(':tagIdentifier')
  remove(@Param('tagIdentifier') tagIdentifier: string) {
    return this.eventsService.removeTag(tagIdentifier);
  }

  @Get(':tagIdentifier/events')
  findEventsByTag(@Param('tagIdentifier') tagIdentifier: string) {
    return this.eventsService.findEventsByTag(tagIdentifier);
  }
}
