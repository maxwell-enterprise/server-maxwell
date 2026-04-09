import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CartsService } from './carts.service';
import { ActiveCartDto, ActiveCartDtoSchema } from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncCart(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(ActiveCartDtoSchema))
    dto: ActiveCartDto,
  ) {
    return this.cartsService.syncCart({
      ...dto,
      userId: String(req.user.sub),
      userEmail: req.user.email ? String(req.user.email) : dto.userEmail,
    });
  }

  @Get()
  getCarts() {
    return this.cartsService.getCarts();
  }

  @Get(':sessionId')
  getCartBySession(@Param('sessionId') sessionId: string) {
    return this.cartsService.getCartBySession(sessionId);
  }
}
