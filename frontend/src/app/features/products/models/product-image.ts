export interface ProductImage {
  readonly id: number;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly position: number;
  readonly primary: boolean;
  readonly url: string;
}
