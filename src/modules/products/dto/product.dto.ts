import { z } from 'zod';

export const ProductCategoryEnum = z.enum([
  'Packages',
  'Certification',
  'Upgrade',
  'Merchandise',
  'Digital',
]);

export const ProductItemTypeEnum = z.enum([
  'PHYSICAL',
  'TICKET',
  'EVENT_CREDIT',
  'DIGITAL_LINK',
  'RECURRING_PASS',
]);

export const ProductItemDtoSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  type: ProductItemTypeEnum,
  quantity: z.coerce.number().int().positive(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type ProductItemDto = z.infer<typeof ProductItemDtoSchema>;

export const ProductVariantDtoSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  priceIdr: z.coerce.number().nonnegative(),
  items: z.array(ProductItemDtoSchema).default([]),
});

export type ProductVariantDto = z.infer<typeof ProductVariantDtoSchema>;

export const InstallmentConfigDtoSchema = z.object({
  enabled: z.boolean(),
  minDownPaymentPercent: z.coerce.number().min(0).max(100),
  maxTenorMonths: z.coerce.number().int().positive(),
  interestRatePercent: z.coerce.number().min(0),
});

export type InstallmentConfigDto = z.infer<typeof InstallmentConfigDtoSchema>;

export const CreateProductDtoSchema = z
  .object({
    id: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional().default(''),
    priceIdr: z.coerce.number().nonnegative(),
    compareAtPriceIdr: z.coerce.number().nonnegative().optional(),
    category: ProductCategoryEnum,
    imageUrl: z.string().max(2048).optional().default(''),
    items: z.array(ProductItemDtoSchema).default([]),
    hasVariants: z.boolean().default(false),
    variants: z.array(ProductVariantDtoSchema).optional(),
    installmentConfig: InstallmentConfigDtoSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const hasTopLevelItems = data.items.length > 0;
    const hasVariantItems =
      data.variants?.some((variant) => variant.items.length > 0) ?? false;

    if (!hasTopLevelItems && !hasVariantItems) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Product must define at least one entitlement item',
        path: ['items'],
      });
    }

    if (data.hasVariants && !(data.variants && data.variants.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Products with variants must include at least one variant',
        path: ['variants'],
      });
    }
  });

export type CreateProductDto = z.infer<typeof CreateProductDtoSchema>;

export const UpdateProductDtoSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    priceIdr: z.coerce.number().nonnegative().optional(),
    compareAtPriceIdr: z.coerce.number().nonnegative().nullable().optional(),
    category: ProductCategoryEnum.optional(),
    imageUrl: z.string().max(2048).nullable().optional(),
    items: z.array(ProductItemDtoSchema).optional(),
    hasVariants: z.boolean().optional(),
    variants: z.array(ProductVariantDtoSchema).nullable().optional(),
    installmentConfig: InstallmentConfigDtoSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductDto = z.infer<typeof UpdateProductDtoSchema>;

export const ProductResponseDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priceIdr: z.number(),
  compareAtPriceIdr: z.number().optional(),
  category: ProductCategoryEnum,
  imageUrl: z.string(),
  items: z.array(ProductItemDtoSchema),
  hasVariants: z.boolean(),
  variants: z.array(ProductVariantDtoSchema).optional(),
  installmentConfig: InstallmentConfigDtoSchema.optional(),
  isActive: z.boolean().optional(),
});

export type ProductResponseDto = z.infer<typeof ProductResponseDtoSchema>;

export const ProductQueryDtoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: ProductCategoryEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  hasVariants: z.coerce.boolean().optional(),
  sortBy: z.enum(['title', 'priceIdr', 'category', 'createdAt']).default('title'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type ProductQueryDto = z.infer<typeof ProductQueryDtoSchema>;
