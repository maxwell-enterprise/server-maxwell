import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertStoreCatalogManager } from '../../common/security/access-policy';

type UploadedImageFile = {
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateProductDtoSchema))
    dto: CreateProductDto,
  ) {
    assertStoreCatalogManager(req.user, 'Product creation');
    return this.productsService.create(dto);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Req() req: { user: JwtUserPayload },
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    assertStoreCatalogManager(req.user, 'Product image upload');
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return this.productsService.uploadImage(file);
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
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
    @Body(new ZodValidationPipe(UpdateProductDtoSchema))
    dto: UpdateProductDto,
  ) {
    assertStoreCatalogManager(req.user, 'Product update');
    return this.productsService.update(identifier, dto);
  }

  @Delete(':identifier')
  @UseGuards(JwtAuthGuard)
  remove(
    @Req() req: { user: JwtUserPayload },
    @Param('identifier') identifier: string,
  ) {
    assertStoreCatalogManager(req.user, 'Product deletion');
    return this.productsService.remove(identifier);
  }
}
