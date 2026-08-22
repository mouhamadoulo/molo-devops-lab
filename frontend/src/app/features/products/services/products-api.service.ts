import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ProductDetail, ProductPage, ProductRequest } from '../models/product';
import { ProductQuery } from '../models/product-query';

@Injectable({ providedIn: 'root' })
export class ProductsApiService {
  private readonly http = inject(HttpClient);
  private readonly productsUrl = `${environment.apiUrl}/products`;

  list(query: ProductQuery): Observable<ProductPage> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', `${query.sort},${query.direction}`);

    if (query.search) params = params.set('search', query.search);
    if (query.category) params = params.set('category', query.category);
    if (query.available !== null) params = params.set('available', query.available);

    return this.http.get<ProductPage>(this.productsUrl, { params });
  }

  get(id: number): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.productsUrl}/${id}`);
  }

  create(request: ProductRequest): Observable<ProductDetail> {
    return this.http.post<ProductDetail>(this.productsUrl, request);
  }

  update(id: number, request: ProductRequest): Observable<ProductDetail> {
    return this.http.put<ProductDetail>(`${this.productsUrl}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.productsUrl}/${id}`);
  }
}
