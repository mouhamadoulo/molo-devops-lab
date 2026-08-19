package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.api.dto.ProductImageResponse;
import com.molo.devopsstore.product.api.dto.ProductResponse;
import com.molo.devopsstore.product.domain.Product;
import org.springframework.stereotype.Component;

@Component
public class ProductMapper {

    public ProductResponse toResponse(Product product) {
        return toResponse(product, null);
    }

    public ProductResponse toResponse(
            Product product,
            ProductImageResponse primaryImage) {
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getCategory(),
                product.getPrice(),
                product.getStockQuantity(),
                product.isAvailable(),
                product.getCreatedAt(),
                product.getUpdatedAt(),
                primaryImage);
    }
}
