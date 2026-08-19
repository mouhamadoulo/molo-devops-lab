package com.molo.devopsstore.product.application;

import java.util.Objects;

public record ObjectDeletionRequested(String objectKey) {

    public ObjectDeletionRequested {
        Objects.requireNonNull(objectKey, "objectKey must not be null");
        if (objectKey.isBlank()) {
            throw new IllegalArgumentException("objectKey must not be blank");
        }
    }
}
