package com.molo.devopsstore.product.application;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.List;

public interface ObjectStorage {

    void ensureBucket();

    StoredObject put(String objectKey, InputStream content, long size, String contentType);

    void delete(String objectKey);

    List<StoredObject> list(String prefix);

    URI presignGet(String objectKey, Duration duration);
}
