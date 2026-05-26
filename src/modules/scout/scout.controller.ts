import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import {
  ScoutChatRequestDto,
  ScoutChatRequestDtoSchema,
} from './dto';
import { ScoutService } from './scout.service';

@Controller('scout')
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) {}

  @Post('chat')
  @RateLimit({ limit: 30, windowMs: 60_000, keyBy: 'leadEmail' })
  chat(
    @Body(new ZodValidationPipe(ScoutChatRequestDtoSchema))
    dto: ScoutChatRequestDto,
  ) {
    return this.scoutService.chat(dto);
  }
}
