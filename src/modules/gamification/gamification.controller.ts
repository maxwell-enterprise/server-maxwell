import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOperationsOnly } from '../../common/security/access-policy';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('badges')
  listBadges() {
    return this.gamification.listBadges();
  }

  @Put('badges/:id')
  @UseGuards(JwtAuthGuard)
  upsertBadge(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Badge update');
    return this.gamification.upsertBadge(decodeURIComponent(id), body ?? {});
  }

  @Get('rules')
  listRules() {
    return this.gamification.listRules();
  }

  @Put('rules/:id')
  @UseGuards(JwtAuthGuard)
  upsertRule(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Gamification rule update');
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
  @UseGuards(JwtAuthGuard)
  upsertProfile(
    @Req() req: { user: JwtUserPayload },
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertOperationsOnly(req.user, 'Gamification profile update');
    return this.gamification.upsertProfile(
      decodeURIComponent(userId),
      body ?? {},
    );
  }
}
