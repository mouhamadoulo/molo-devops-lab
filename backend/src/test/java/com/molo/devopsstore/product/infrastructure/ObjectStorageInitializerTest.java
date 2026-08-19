package com.molo.devopsstore.product.infrastructure;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.molo.devopsstore.product.application.ObjectStorage;
import org.junit.jupiter.api.Test;

class ObjectStorageInitializerTest {

    @Test
    void ensuresTheApplicationBucketAtStartup() throws Exception {
        var objectStorage = mock(ObjectStorage.class);
        var initializer = new ObjectStorageInitializer(objectStorage);

        initializer.run(null);

        verify(objectStorage).ensureBucket();
    }
}
