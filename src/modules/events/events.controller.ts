/**
 * MAXWELL ERP - Events Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EventsService } from './events.service';
import {
  CreateEventDtoSchema,
  UpdateEventDtoSchema,
  EventQueryDtoSchema,
  CreateAccessTagDtoSchema,
  CreateAccessRuleDtoSchema,
  CreateTierDtoSchema,
  CreateGateDtoSchema,
} from './dto';
import type {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  CreateAccessTagDto,
  CreateAccessRuleDto,
  CreateTierDto,
  CreateGateDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ==========================================================================
  // EVENTS
  // ==========================================================================

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

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEventDtoSchema)) dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.remove(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    return this.eventsService.updateStatus(id, status);
  }

  // ==========================================================================
  // EVENT TIERS
  // ==========================================================================

  @Post(':eventId/tiers')
  createTier(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(CreateTierDtoSchema)) dto: CreateTierDto,
  ) {
    return this.eventsService.createTier(eventId, dto);
  }

  @Get(':eventId/tiers')
  findTiers(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.eventsService.findTiers(eventId);
  }

  // ==========================================================================
  // EVENT GATES
  // ==========================================================================

  @Post(':eventId/gates')
  createGate(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(CreateGateDtoSchema)) dto: CreateGateDto,
  ) {
    return this.eventsService.createGate(eventId, dto);
  }

  @Get(':eventId/gates')
  findGates(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.eventsService.findGates(eventId);
  }

  // ==========================================================================
  // ACCESS RULES
  // ==========================================================================

  @Post(':eventId/access-rules')
  createAccessRule(
    @Body(new ZodValidationPipe(CreateAccessRuleDtoSchema))
    dto: CreateAccessRuleDto,
  ) {
    return this.eventsService.createAccessRule(dto);
  }

  @Get(':eventId/access-rules')
  findAccessRules(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.eventsService.findAccessRules(eventId);
  }

  // ==========================================================================
  // CHILD EVENTS (for Series)
  // ==========================================================================

  @Get(':id/children')
  getChildEvents(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getChildEvents(id);
  }

  @Get(':id/attendance')
  getAttendanceSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getAttendanceSummary(id);
  }
}

// ==========================================================================
// ACCESS TAGS CONTROLLER (Separate for better organization)
// ==========================================================================

@Controller('access-tags')
export class AccessTagsController {
  constructor(private readonly eventsService: EventsService) {}

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

  @Get(':tagId/events')
  findEventsByTag(@Param('tagId', ParseUUIDPipe) tagId: string) {
    return this.eventsService.findEventsByTag(tagId);
  }
}
