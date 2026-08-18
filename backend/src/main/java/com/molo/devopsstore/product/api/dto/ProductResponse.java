package com.molo.devopsstore.product.api.dto;

import com.molo.devopsstore.product.domain.ProductCategory;
import java.math.BigDecimal;
import java.time.Instant;

public record ProductResponse(
        Long id,
        String name,
        String description,
        ProductCategory category,
        BigDecimal price,
        int stockQuantity,
        boolean available,
        Instant createdAt,
        Instant updatedAt) {
}
