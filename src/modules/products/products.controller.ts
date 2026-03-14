import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  CreateProductDtoSchema,
  ProductQueryDto,
  ProductQueryDtoSchema,
  UpdateProductDto,
  UpdateProductDtoSchema,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProductDtoSchema))
    dto: CreateProductDto,
  ) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(ProductQueryDtoSchema))
    query: ProductQueryDto,
  ) {
    return this.productsService.findAll(query);
  }

  @Get(':identifier')
  findOne(@Param('identifier') identifier: string) {
    return this.productsService.findOne(identifier);
  }

  @Patch(':identifier')
  update(
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateProductDtoSchema))
    dto: UpdateProductDto,
  ) {
    return this.productsService.update(identifier, dto);
  }

  @Delete(':identifier')
  remove(@Param('identifier') identifier: string) {
    return this.productsService.remove(identifier);
  }
}
