package com.molo.devopsstore.product.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.molo.devopsstore.testsupport.S3ContainerSupport;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MinioObjectStorageIntegrationTest {

    private static final byte[] CONTENT = "devops-store-s3-round-trip"
            .getBytes(StandardCharsets.UTF_8);

    @Container
    static final org.testcontainers.containers.GenericContainer<?> OBJECT_STORAGE =
            S3ContainerSupport.container();

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private MinioObjectStorage objectStorage;

    @BeforeEach
    void setUp() {
        var endpoint = "http://" + OBJECT_STORAGE.getHost() + ":" + OBJECT_STORAGE.getMappedPort(9000);
        var properties = new MinioProperties(
                endpoint,
                endpoint,
                S3ContainerSupport.ACCESS_KEY,
                S3ContainerSupport.SECRET_KEY,
                S3ContainerSupport.BUCKET,
                "us-east-1");
        objectStorage = new MinioObjectStorage(properties);
        new ObjectStorageInitializer(objectStorage).run(null);
    }

    @Test
    void createsBucketIdempotentlyAndServesAFiveMinutePresignedGet() throws Exception {
        objectStorage.ensureBucket();

        var stored = objectStorage.put(
                "products/42/round-trip.txt",
                new ByteArrayInputStream(CONTENT),
                CONTENT.length,
                "text/plain");

        assertThat(stored.objectKey()).isEqualTo("products/42/round-trip.txt");
        assertThat(stored.etag()).isNotBlank();
        assertThat(objectStorage.list("products/42/"))
                .anySatisfy(item -> {
                    assertThat(item.objectKey()).isEqualTo(stored.objectKey());
                    assertThat(item.etag()).isNotBlank();
                    assertThat(item.lastModified()).isNotNull();
                });

        var response = get(objectStorage.presignGet(stored.objectKey(), Duration.ofMinutes(5)));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo(CONTENT);
    }

    @Test
    void deletesAStoredObject() throws Exception {
        var stored = objectStorage.put(
                "products/42/deleted.txt",
                new ByteArrayInputStream(CONTENT),
                CONTENT.length,
                "text/plain");
        URI signedUrl = objectStorage.presignGet(stored.objectKey(), Duration.ofMinutes(5));

        objectStorage.delete(stored.objectKey());

        assertThat(get(signedUrl).statusCode()).isEqualTo(404);
    }

    private HttpResponse<byte[]> get(URI uri) throws Exception {
        var request = HttpRequest.newBuilder(uri).GET().build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }
}
