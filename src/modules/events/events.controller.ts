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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsRuntimeService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateEventDtoSchema)) dto: CreateEventDto,
  ) {
    assertOperationsOnly(req.user, 'Event creation');
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
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateEventDtoSchema)) dto: UpdateEventDto,
  ) {
    assertOperationsOnly(req.user, 'Event update');
    return this.eventsService.update(identifier, dto);
  }

  @Delete(':identifier')
  @UseGuards(JwtAuthGuard)
  remove(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
  ) {
    assertOperationsOnly(req.user, 'Event deletion');
    return this.eventsService.remove(identifier);
  }

  @Patch(':identifier/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
    @Body('status') status: string,
  ) {
    assertOperationsOnly(req.user, 'Event status update');
    return this.eventsService.updateStatus(identifier, status);
  }

  @Post(':eventIdentifier/tiers')
  @UseGuards(JwtAuthGuard)
  createTier(
    @Req() req: { user: JwtUserPayload },
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateTierDtoSchema)) dto: CreateTierDto,
  ) {
    assertOperationsOnly(req.user, 'Event tier creation');
    return this.eventsService.createTier(eventIdentifier, dto);
  }

  @Get(':eventIdentifier/tiers')
  findTiers(@Param('eventIdentifier') eventIdentifier: string) {
    return this.eventsService.findTiers(eventIdentifier);
  }

  @Post(':eventIdentifier/gates')
  @UseGuards(JwtAuthGuard)
  createGate(
    @Req() req: { user: JwtUserPayload },
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateGateDtoSchema)) dto: CreateGateDto,
  ) {
    assertOperationsOnly(req.user, 'Gate creation');
    return this.eventsService.createGate(eventIdentifier, dto);
  }

  @Get(':eventIdentifier/gates')
  findGates(@Param('eventIdentifier') eventIdentifier: string) {
    return this.eventsService.findGates(eventIdentifier);
  }

  @Post(':eventIdentifier/access-rules')
  @UseGuards(JwtAuthGuard)
  createAccessRule(
    @Req() req: { user: JwtUserPayload },
    @Param('eventIdentifier') eventIdentifier: string,
    @Body(new ZodValidationPipe(CreateAccessRuleDtoSchema))
    dto: CreateAccessRuleDto,
  ) {
    assertOperationsOnly(req.user, 'Access rule creation');
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
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateAccessTagDtoSchema))
    dto: CreateAccessTagDto,
  ) {
    assertOperationsOnly(req.user, 'Access tag creation');
    return this.eventsService.createTag(dto);
  }

  @Get()
  findAll() {
    return this.eventsService.findAllTags();
  }

  @Patch(':tagIdentifier')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('tagIdentifier') tagIdentifier: string,
    @Body(new ZodValidationPipe(UpdateAccessTagDtoSchema))
    dto: UpdateAccessTagDto,
  ) {
    assertOperationsOnly(req.user, 'Access tag update');
    return this.eventsService.updateTag(tagIdentifier, dto);
  }

  @Delete(':tagIdentifier')
  @UseGuards(JwtAuthGuard)
  remove(
    @Req() req: { user: JwtUserPayload },
    @Param('tagIdentifier') tagIdentifier: string,
  ) {
    assertOperationsOnly(req.user, 'Access tag deletion');
    return this.eventsService.removeTag(tagIdentifier);
  }

  @Get(':tagIdentifier/events')
  findEventsByTag(@Param('tagIdentifier') tagIdentifier: string) {
    return this.eventsService.findEventsByTag(tagIdentifier);
  }
}
