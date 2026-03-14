import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CartsService } from './carts.service';
import { ActiveCartDto, ActiveCartDtoSchema } from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post('sync')
  syncCart(
    @Body(new ZodValidationPipe(ActiveCartDtoSchema))
    dto: ActiveCartDto,
  ) {
    return this.cartsService.syncCart(dto);
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
