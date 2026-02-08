/**
 * MAXWELL ERP - Product & Commerce Zod Schemas (The Store)
 */

import { z } from 'zod';
import {
  ProductTypeEnum,
  ItemTypeEnum,
  StockTypeEnum,
  PricingTierEnum,
} from './enums.schema';

// =============================================================================
// PRODUCT SCHEMA
// =============================================================================

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  type: ProductTypeEnum,
  isBundle: z.boolean().default(false),
  basePriceIdr: z.number().positive(),
  salePriceIdr: z.number().positive().nullable().optional(),
  stockType: StockTypeEnum,
  currentStock: z.number().int().nullable().optional(),
  reservedStock: z.number().int().default(0),
  linkedEventId: z.string().uuid().nullable().optional(),
  linkedTierId: z.string().uuid().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  galleryUrls: z.array(z.string().url()).default([]),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  availableFrom: z.coerce.date().nullable().optional(),
  availableUntil: z.coerce.date().nullable().optional(),
  maxPerOrder: z.number().int().positive().nullable().optional(),
  maxPerUser: z.number().int().positive().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reservedStock: true,
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

// =============================================================================
// PRODUCT ENTITLEMENT SCHEMA (Resep Paket)
// =============================================================================

export const ProductEntitlementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  tagId: z.string().uuid().nullable().optional(),
  itemType: ItemTypeEnum,
  amount: z.number().int().positive().default(1),
  physicalItemName: z.string().max(255).nullable().optional(),
  physicalItemSku: z.string().max(100).nullable().optional(),
  digitalAccessUrl: z.string().url().nullable().optional(),
  digitalAccessType: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type ProductEntitlement = z.infer<typeof ProductEntitlementSchema>;

export const CreateProductEntitlementSchema = ProductEntitlementSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateProductEntitlementInput = z.infer<
  typeof CreateProductEntitlementSchema
>;

// =============================================================================
// PRICING TIER SCHEMA
// =============================================================================

export const ProductPricingTierSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  tier: PricingTierEnum,
  name: z.string().min(1).max(100),
  priceIdr: z.number().positive(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  maxQuantity: z.number().int().positive().nullable().optional(),
  soldQuantity: z.number().int().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});

export type ProductPricingTier = z.infer<typeof ProductPricingTierSchema>;

// =============================================================================
// VOUCHER SCHEMA
// =============================================================================

export const VoucherSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().positive(),
  maxDiscountAmount: z.number().positive().nullable().optional(),
  minPurchaseAmount: z.number().positive().nullable().optional(),
  maxUsage: z.number().int().positive().nullable().optional(),
  maxUsagePerUser: z.number().int().positive().nullable().optional(),
  currentUsage: z.number().int().default(0),
  applicableProductIds: z.array(z.string().uuid()).nullable().optional(),
  applicableCategories: z.array(z.string()).nullable().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  isActive: z.boolean().default(true),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type Voucher = z.infer<typeof VoucherSchema>;

export const CreateVoucherSchema = VoucherSchema.omit({
  id: true,
  createdAt: true,
  currentUsage: true,
}).refine((data) => data.validUntil > data.validFrom, {
  message: 'Valid until must be after valid from',
  path: ['validUntil'],
});

export type CreateVoucherInput = z.infer<typeof CreateVoucherSchema>;

// =============================================================================
// CART SCHEMA
// =============================================================================

export const CartItemSchema = z.object({
  id: z.string().uuid(),
  cartId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  unitPriceIdr: z.number().positive(),
  pricingTierId: z.string().uuid().nullable().optional(),
  voucherId: z.string().uuid().nullable().optional(),
  discountAmount: z.number().default(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const AddToCartSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  pricingTierId: z.string().uuid().optional(),
});

export type AddToCartInput = z.infer<typeof AddToCartSchema>;
