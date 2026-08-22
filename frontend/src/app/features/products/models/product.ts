import { PageResponse } from './page-response';
import { ProductImage } from './product-image';

export const PRODUCT_CATEGORIES = [
  'SMARTPHONE',
  'LAPTOP',
  'TABLET',
  'ACCESSORY',
  'AUDIO',
  'OTHER',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export const PRODUCT_CATEGORY_LABELS: Readonly<Record<ProductCategory, string>> = {
  SMARTPHONE: 'Smartphone',
  LAPTOP: 'Ordinateur portable',
  TABLET: 'Tablette',
  ACCESSORY: 'Accessoire',
  AUDIO: 'Audio',
  OTHER: 'Autre',
};

export interface ProductRequest {
  readonly name: string;
  readonly description: string | null;
  readonly category: ProductCategory;
  readonly price: number;
  readonly stockQuantity: number;
  readonly available: boolean;
}

export interface ProductSummary extends ProductRequest {
  readonly id: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly primaryImage: ProductImage | null;
}

export type ProductDetail = ProductSummary;
export type ProductPage = PageResponse<ProductSummary>;
