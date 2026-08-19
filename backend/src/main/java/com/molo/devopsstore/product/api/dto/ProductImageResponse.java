package com.molo.devopsstore.product.api.dto;

import java.net.URI;

public record ProductImageResponse(
        Long id,
        String contentType,
        long sizeBytes,
        int width,
        int height,
        int position,
        boolean primary,
        URI url) {
}
