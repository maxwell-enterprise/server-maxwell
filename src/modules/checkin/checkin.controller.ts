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
  ParseUUIDPipe,
  Delete,
} from '@nestjs/common';
import { CheckinService } from './checkin.service';
import {
  ScanQrDtoSchema,
  RegisterDeviceDtoSchema,
  OfflineSyncBatchDtoSchema,
  CheckinQueryDtoSchema,
} from './dto';
import type {
  ScanQrDto,
  RegisterDeviceDto,
  OfflineSyncBatchDto,
  CheckinQueryDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  /**
   * Scan QR code for check-in
   * POST /checkin/scan
   */
  @Post('scan')
  scanQr(@Body(new ZodValidationPipe(ScanQrDtoSchema)) dto: ScanQrDto) {
    const scannedByUserId = undefined; // TODO: Get from auth
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
  getEventStats(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.checkinService.getEventStats(eventId);
  }

  /**
   * Process checkout
   * POST /checkin/:id/checkout
   */
  @Post(':id/checkout')
  checkout(@Param('id', ParseUUIDPipe) id: string) {
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
  registerDevice(
    @Body(new ZodValidationPipe(RegisterDeviceDtoSchema))
    dto: RegisterDeviceDto,
  ) {
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
  deactivateDevice(@Param('deviceId') deviceId: string) {
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
  syncOfflineCheckins(
    @Body(new ZodValidationPipe(OfflineSyncBatchDtoSchema))
    dto: OfflineSyncBatchDto,
  ) {
    return this.checkinService.syncOfflineCheckins(dto);
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
