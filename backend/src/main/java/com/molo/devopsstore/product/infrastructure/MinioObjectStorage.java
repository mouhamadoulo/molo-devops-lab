package com.molo.devopsstore.product.infrastructure;

import com.molo.devopsstore.product.application.ObjectStorage;
import com.molo.devopsstore.product.application.StorageException;
import com.molo.devopsstore.product.application.StoredObject;
import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.Http.Method;
import io.minio.ListObjectsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(MinioProperties.class)
public class MinioObjectStorage implements ObjectStorage {

    private static final Duration MAX_PRESIGNED_URL_DURATION = Duration.ofDays(7);

    private final MinioClient client;
    private final String bucket;

    public MinioObjectStorage(MinioProperties properties) {
        Objects.requireNonNull(properties, "properties must not be null");
        this.client = MinioClient.builder()
                .endpoint(properties.endpoint())
                .credentials(properties.accessKey(), properties.secretKey())
                .build();
        this.bucket = properties.bucket();
    }

    @Override
    public void ensureBucket() {
        execute(() -> {
            var exists = client.bucketExists(BucketExistsArgs.builder()
                    .bucket(bucket)
                    .build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder()
                        .bucket(bucket)
                        .build());
            }
            return null;
        });
    }

    @Override
    public StoredObject put(String objectKey, InputStream content, long size, String contentType) {
        requireObjectKey(objectKey);
        Objects.requireNonNull(content, "content must not be null");
        if (size < 0) {
            throw new IllegalArgumentException("size must not be negative");
        }
        if (contentType == null || contentType.isBlank()) {
            throw new IllegalArgumentException("contentType must not be blank");
        }

        return execute(() -> {
            var response = client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(content, size, -1L)
                    .contentType(contentType)
                    .build());
            return new StoredObject(objectKey, response.etag());
        });
    }

    @Override
    public void delete(String objectKey) {
        requireObjectKey(objectKey);
        execute(() -> {
            client.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build());
            return null;
        });
    }

    @Override
    public List<StoredObject> list(String prefix) {
        Objects.requireNonNull(prefix, "prefix must not be null");
        return execute(() -> {
            var objects = new ArrayList<StoredObject>();
            var results = client.listObjects(ListObjectsArgs.builder()
                    .bucket(bucket)
                    .prefix(prefix)
                    .recursive(true)
                    .build());
            for (var result : results) {
                var item = result.get();
                objects.add(new StoredObject(
                        item.objectName(),
                        item.etag(),
                        item.lastModified().toInstant()));
            }
            return List.copyOf(objects);
        });
    }

    @Override
    public URI presignGet(String objectKey, Duration duration) {
        requireObjectKey(objectKey);
        if (duration == null || duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException("duration must be positive");
        }
        if (duration.compareTo(MAX_PRESIGNED_URL_DURATION) > 0) {
            throw new IllegalArgumentException("duration must not exceed seven days");
        }

        return execute(() -> URI.create(client.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs.builder()
                        .method(Method.GET)
                        .bucket(bucket)
                        .object(objectKey)
                        .expiry(Math.toIntExact(duration.toSeconds()))
                        .build())));
    }

    private void requireObjectKey(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            throw new IllegalArgumentException("objectKey must not be blank");
        }
    }

    private <T> T execute(StorageOperation<T> operation) {
        try {
            return operation.execute();
        } catch (Exception exception) {
            throw new StorageException("Object storage operation failed", exception);
        }
    }

    @FunctionalInterface
    private interface StorageOperation<T> {
        T execute() throws Exception;
    }
}
