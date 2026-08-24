package com.molo.devopsstore.product.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.storage.minio")
public record MinioProperties(
        String endpoint,
        String publicEndpoint,
        String accessKey,
        String secretKey,
        String bucket,
        String region) {

    public MinioProperties {
        endpoint = requireText(endpoint, "MINIO_ENDPOINT must not be blank");
        publicEndpoint = publicEndpoint == null || publicEndpoint.isBlank()
                ? endpoint
                : publicEndpoint.trim();
        accessKey = requireText(accessKey, "MINIO_ACCESS_KEY must not be blank");
        secretKey = requireText(secretKey, "MINIO_SECRET_KEY must not be blank");
        bucket = requireText(bucket, "MINIO_BUCKET must not be blank");
        region = requireText(region, "MINIO_REGION must not be blank");
    }

    private static String requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }
}
