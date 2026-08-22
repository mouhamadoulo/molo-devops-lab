import { ParamMap, Params } from '@angular/router';
import { PRODUCT_CATEGORIES, ProductCategory } from './product';

export const PRODUCT_SORTS = ['name', 'price', 'stockQuantity', 'createdAt'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const PRODUCT_PAGE_SIZES = [10, 20, 40, 80] as const;

export type ProductSort = typeof PRODUCT_SORTS[number];
export type SortDirection = typeof SORT_DIRECTIONS[number];

export interface ProductQuery {
  readonly search: string;
  readonly category: ProductCategory | null;
  readonly available: boolean | null;
  readonly page: number;
  readonly size: number;
  readonly sort: ProductSort;
  readonly direction: SortDirection;
}

export const DEFAULT_PRODUCT_QUERY: ProductQuery = {
  search: '',
  category: null,
  available: null,
  page: 0,
  size: 20,
  sort: 'name',
  direction: 'asc',
};

export function productQueryFromParamMap(params: ParamMap): ProductQuery {
  return {
    search: params.get('search')?.trim() ?? '',
    category: parseCategory(params.get('category')),
    available: parseAvailable(params.get('available')),
    page: parseNonNegativeInteger(params.get('page'), DEFAULT_PRODUCT_QUERY.page),
    size: parsePageSize(params.get('size')),
    sort: parseMember(params.get('sort'), PRODUCT_SORTS, DEFAULT_PRODUCT_QUERY.sort),
    direction: parseMember(params.get('direction'), SORT_DIRECTIONS, DEFAULT_PRODUCT_QUERY.direction),
  };
}

export function productQueryToParams(query: ProductQuery): Params {
  return {
    search: query.search || null,
    category: query.category,
    available: query.available === null ? null : String(query.available),
    page: String(query.page),
    size: String(query.size),
    sort: query.sort,
    direction: query.direction,
  };
}

function parseCategory(value: string | null): ProductCategory | null {
  return value && PRODUCT_CATEGORIES.includes(value as ProductCategory)
    ? value as ProductCategory
    : null;
}

function parseAvailable(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseNonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePageSize(value: string | null): number {
  const parsed = Number(value);
  return PRODUCT_PAGE_SIZES.includes(parsed as typeof PRODUCT_PAGE_SIZES[number])
    ? parsed
    : DEFAULT_PRODUCT_QUERY.size;
}

function parseMember<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value && values.includes(value as T) ? value as T : fallback;
}
