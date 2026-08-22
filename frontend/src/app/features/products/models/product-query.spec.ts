import { convertToParamMap } from '@angular/router';
import { DEFAULT_PRODUCT_QUERY, productQueryFromParamMap, productQueryToParams } from './product-query';

describe('product query codec', () => {
  it('deserializes every supported catalog parameter', () => {
    const query = productQueryFromParamMap(convertToParamMap({
      search: '  portable  ',
      category: 'LAPTOP',
      available: 'false',
      page: '2',
      size: '40',
      sort: 'price',
      direction: 'desc',
    }));

    expect(query).toEqual({
      search: 'portable',
      category: 'LAPTOP',
      available: false,
      page: 2,
      size: 40,
      sort: 'price',
      direction: 'desc',
    });
  });

  it('falls back to safe defaults for unsupported values', () => {
    const query = productQueryFromParamMap(convertToParamMap({
      category: 'SERVER',
      available: 'sometimes',
      page: '-4',
      size: '5000',
      sort: 'description',
      direction: 'sideways',
    }));

    expect(query).toEqual(DEFAULT_PRODUCT_QUERY);
  });

  it('serializes only active filters while preserving paging and sorting', () => {
    expect(productQueryToParams({
      ...DEFAULT_PRODUCT_QUERY,
      search: 'audio',
      available: true,
      page: 3,
      sort: 'createdAt',
      direction: 'desc',
    })).toEqual({
      search: 'audio',
      category: null,
      available: 'true',
      page: '3',
      size: '20',
      sort: 'createdAt',
      direction: 'desc',
    });
  });
});
