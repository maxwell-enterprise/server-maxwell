import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { GamificationService } from './gamification.service';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('badges')
  listBadges() {
    return this.gamification.listBadges();
  }

  @Put('badges/:id')
  upsertBadge(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.gamification.upsertBadge(decodeURIComponent(id), body ?? {});
  }

  @Get('rules')
  listRules() {
    return this.gamification.listRules();
  }

  @Put('rules/:id')
  upsertRule(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.gamification.upsertRule(decodeURIComponent(id), body ?? {});
  }

  @Get('profiles')
  listProfiles() {
    return this.gamification.listProfiles();
  }

  @Get('profiles/lookup/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.gamification.getProfileByUserId(decodeURIComponent(userId));
  }

  @Put('profiles/:userId')
  upsertProfile(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.gamification.upsertProfile(
      decodeURIComponent(userId),
      body ?? {},
    );
  }
}
