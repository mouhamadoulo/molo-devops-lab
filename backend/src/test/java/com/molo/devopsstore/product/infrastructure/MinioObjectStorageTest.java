package com.molo.devopsstore.product.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class MinioObjectStorageTest {

    @Test
    void signsBrowserUrlsWithThePublicEndpoint() {
        var properties = new MinioProperties(
                "http://minio.internal:9000",
                "http://localhost:9000",
                "access",
                "secret",
                "bucket",
                "eu-west-1");
        var objectStorage = new MinioObjectStorage(properties);

        var signedUrl = objectStorage.presignGet(
                "products/42/image.jpg",
                Duration.ofMinutes(5));

        assertThat(signedUrl.getHost()).isEqualTo("localhost");
        assertThat(signedUrl.getPort()).isEqualTo(9000);
        assertThat(signedUrl.getPath()).isEqualTo("/bucket/products/42/image.jpg");
        assertThat(signedUrl.getRawQuery()).contains("X-Amz-Signature=");
        assertThat(signedUrl.getRawQuery()).contains("%2Feu-west-1%2Fs3%2Faws4_request");
    }
}
