package com.molo.devopsstore.product.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MinioPropertiesTest {

    @Test
    void fallsBackToTheInternalEndpointWhenThePublicEndpointIsBlank() {
        var properties = new MinioProperties(
                "http://minio.internal:9000",
                " ",
                "access",
                "secret",
                "bucket",
                "us-east-1");

        assertThat(properties.publicEndpoint()).isEqualTo("http://minio.internal:9000");
    }

    @Test
    void keepsAnExplicitPublicEndpoint() {
        var properties = new MinioProperties(
                "http://minio.internal:9000",
                " http://localhost:9000 ",
                "access",
                "secret",
                "bucket",
                "us-east-1");

        assertThat(properties.publicEndpoint()).isEqualTo("http://localhost:9000");
    }
}
