/**
 * MAXWELL ERP - Check-in Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CheckinRuntimeService } from './checkin.runtime.service';
import {
  ScanQrDtoSchema,
  RegisterDeviceDtoSchema,
  OfflineSyncBatchDtoSchema,
  CheckinQueryDtoSchema,
  ManualCheckinDtoSchema,
} from './dto';
import type {
  ScanQrDto,
  RegisterDeviceDto,
  OfflineSyncBatchDto,
  CheckinQueryDto,
  ManualCheckinDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertOpsOrGateKeeper } from '../../common/security/access-policy';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinRuntimeService) {}

  /**
   * Scan QR code for check-in
   * POST /checkin/scan
   */
  @Post('scan')
  @UseGuards(JwtAuthGuard)
  scanQr(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(ScanQrDtoSchema)) dto: ScanQrDto,
  ) {
    assertOpsOrGateKeeper(req.user, 'Check-in scan');
    const scannedByUserId = String(req.user.sub);
    return this.checkinService.scanQr(dto, scannedByUserId);
  }

  /**
   * Get check-in records
   * GET /checkin
   */
  @Get()
  getCheckins(
    @Query(new ZodValidationPipe(CheckinQueryDtoSchema)) query: CheckinQueryDto,
  ) {
    return this.checkinService.getCheckins(query);
  }

  /**
   * Get event check-in stats
   * GET /checkin/events/:eventId/stats
   */
  @Get('events/:eventId/stats')
  getEventStats(@Param('eventId') eventId: string) {
    return this.checkinService.getEventStats(eventId);
  }

  /**
   * Process checkout
   * POST /checkin/:id/checkout
   */
  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Req() req: { user: JwtUserPayload }, @Param('id') id: string) {
    assertOpsOrGateKeeper(req.user, 'Check-out');
    return this.checkinService.checkout(id);
  }

  // ==========================================================================
  // SCANNER DEVICES
  // ==========================================================================

  /**
   * Register scanner device
   * POST /checkin/devices
   */
  @Post('devices')
  @UseGuards(JwtAuthGuard)
  registerDevice(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(RegisterDeviceDtoSchema))
    dto: RegisterDeviceDto,
  ) {
    assertOpsOrGateKeeper(req.user, 'Device registration');
    return this.checkinService.registerDevice(dto);
  }

  /**
   * Get registered devices
   * GET /checkin/devices
   */
  @Get('devices')
  getDevices(@Query('eventId') eventId?: string) {
    return this.checkinService.getDevices(eventId);
  }

  /**
   * Deactivate device
   * DELETE /checkin/devices/:deviceId
   */
  @Delete('devices/:deviceId')
  @UseGuards(JwtAuthGuard)
  deactivateDevice(
    @Req() req: { user: JwtUserPayload },
    @Param('deviceId') deviceId: string,
  ) {
    assertOpsOrGateKeeper(req.user, 'Device deactivation');
    return this.checkinService.deactivateDevice(deviceId);
  }

  // ==========================================================================
  // OFFLINE SYNC
  // ==========================================================================

  /**
   * Sync offline check-ins
   * POST /checkin/sync
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncOfflineCheckins(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(OfflineSyncBatchDtoSchema))
    dto: OfflineSyncBatchDto,
  ) {
    assertOpsOrGateKeeper(req.user, 'Offline check-in sync');
    return this.checkinService.syncOfflineCheckins(dto);
  }

  /**
   * Manual attendance recording (e.g. mobile self-check)
   */
  @Post('manual')
  @UseGuards(JwtAuthGuard)
  manualCheckin(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(ManualCheckinDtoSchema))
    dto: ManualCheckinDto,
  ) {
    assertOpsOrGateKeeper(req.user, 'Manual check-in');
    return this.checkinService.manualCheckin(
      dto.memberId,
      dto.eventId,
      dto.method,
    );
  }

  /**
   * Get pending sync items for device
   * GET /checkin/sync/:deviceId/pending
   */
  @Get('sync/:deviceId/pending')
  getPendingSyncItems(@Param('deviceId') deviceId: string) {
    return this.checkinService.getPendingSyncItems(deviceId);
  }
}
