/**
 * DEV/QA ONLY — remove after internal testing:
 * - Delete this file
 * - Remove from StoreSupportModule controllers[]
 * - Remove seed/clear methods from StoreSupportService (marked DEV/QA ONLY)
 * - Remove allowActionCenterDevSeed + ENABLE_DEV_ACTION_CENTER_SEED from env/config
 * - Remove FE button + NEXT_PUBLIC_ENABLE_DEV_ACTION_CENTER_SEED
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Query,
} from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { StoreSupportService } from './store-support.service';

@Controller('store/dev')
export class StoreDevSeedController {
  constructor(
    private readonly storeSupport: StoreSupportService,
    private readonly config: AppConfigService,
  ) {}

  private assertDevSeedAllowed(): void {
    if (!this.config.allowActionCenterDevSeed) {
      throw new ForbiddenException(
        'Action Center dev seed is disabled in this environment.',
      );
    }
  }

  /** POST /fe/store/dev/seed-action-center?role=Operations */
  @Post('seed-action-center')
  seedActionCenter(@Query('role') role?: string) {
    this.assertDevSeedAllowed();
    return this.storeSupport.seedActionCenterDev(role);
  }

  /** POST /fe/store/dev/clear-action-center-seed — body from seed response */
  @Post('clear-action-center-seed')
  clearActionCenterSeed(
    @Body() body: { checklistId: string; ticketIds: string[] },
  ) {
    this.assertDevSeedAllowed();
    return this.storeSupport.clearActionCenterDevSeed(body ?? {});
  }
}
