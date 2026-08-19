package com.molo.devopsstore.product.application;

import java.time.Instant;

public record StoredObject(String objectKey, String etag, Instant lastModified) {

    public StoredObject(String objectKey, String etag) {
        this(objectKey, etag, Instant.now());
    }
}
