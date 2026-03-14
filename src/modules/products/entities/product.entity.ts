export type ProductCategory =
  | 'Packages'
  | 'Certification'
  | 'Upgrade'
  | 'Merchandise'
  | 'Digital';

export type ProductEntitlementType =
  | 'PHYSICAL'
  | 'TICKET'
  | 'EVENT_CREDIT'
  | 'DIGITAL_LINK'
  | 'RECURRING_PASS';

export class ProductItem {
  id: string;
  name: string;
  type: ProductEntitlementType;
  quantity: number;
  meta?: Record<string, unknown>;
}

export class ProductVariant {
  id: string;
  name: string;
  priceIdr: number;
  items: ProductItem[];
}

export class InstallmentConfig {
  enabled: boolean;
  minDownPaymentPercent: number;
  maxTenorMonths: number;
  interestRatePercent: number;
}

export class Product {
  id: string;
  title: string;
  description: string;
  priceIdr: number;
  compareAtPriceIdr?: number;
  category: ProductCategory;
  imageUrl: string;
  items: ProductItem[];
  hasVariants: boolean;
  variants?: ProductVariant[];
  installmentConfig?: InstallmentConfig;
  isActive?: boolean;
}
