import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ApiError } from '../../../../core/http/problem-detail';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  ProductDetail,
  ProductRequest,
} from '../../models/product';

@Component({
  selector: 'app-product-form',
  imports: [
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    ReactiveFormsModule,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductForm {
  private readonly formBuilder = inject(FormBuilder).nonNullable;

  readonly initialValue = input<ProductDetail | null>(null);
  readonly apiError = input<ApiError | null>(null);
  readonly submitting = input(false);
  readonly submitLabel = input('Enregistrer le produit');
  readonly save = output<ProductRequest>();
  readonly cancelled = output<void>();
  readonly categories = PRODUCT_CATEGORIES;
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  readonly form = this.formBuilder.group({
    name: ['', [nonBlank, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(2_000)]],
    category: this.formBuilder.control<(typeof PRODUCT_CATEGORIES)[number]>('OTHER', Validators.required),
    price: [0, [Validators.required, Validators.min(0), productPriceDigits]],
    stockQuantity: [0, [Validators.required, Validators.min(0), integerStock]],
    available: true,
  });

  constructor() {
    effect(() => {
      const product = this.initialValue();
      if (!product) return;
      this.form.reset({
        name: product.name,
        description: product.description ?? '',
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
        available: product.available,
      });
    });

    effect(() => {
      const fieldErrors = this.apiError()?.fieldErrors ?? {};
      for (const control of Object.values(this.form.controls)) {
        if (!control.hasError('server')) continue;
        const remainingErrors = { ...control.errors };
        delete remainingErrors['server'];
        control.setErrors(Object.keys(remainingErrors).length > 0 ? remainingErrors : null);
      }
      for (const [field, message] of Object.entries(fieldErrors)) {
        const control = this.form.get(field);
        if (control) {
          control.setErrors({ ...control.errors, server: message });
          control.markAsTouched();
        }
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const description = value.description.trim();
    this.save.emit({
      ...value,
      name: value.name.trim(),
      description: description || null,
    });
  }
}

function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length > 0 ? null : { required: true };
}

function productPriceDigits(control: AbstractControl<number>): ValidationErrors | null {
  return Number.isFinite(control.value) && /^\d{1,10}(?:\.\d{1,2})?$/.test(String(control.value))
    ? null
    : { digits: true };
}

function integerStock(control: AbstractControl<number>): ValidationErrors | null {
  return Number.isInteger(control.value) ? null : { integer: true };
}
