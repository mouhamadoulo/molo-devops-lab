package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.api.dto.ProductImageResponse;
import com.molo.devopsstore.product.domain.ProductImage;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class ProductImageMapper {

    private static final Duration SIGNED_URL_DURATION = Duration.ofMinutes(5);

    private final ObjectStorage objectStorage;

    public ProductImageMapper(ObjectStorage objectStorage) {
        this.objectStorage = objectStorage;
    }

    public ProductImageResponse toResponse(ProductImage image) {
        return new ProductImageResponse(
                image.getId(),
                image.getContentType(),
                image.getSizeBytes(),
                image.getWidth(),
                image.getHeight(),
                image.getPosition(),
                image.isPrimary(),
                objectStorage.presignGet(image.getObjectKey(), SIGNED_URL_DURATION));
    }
}
