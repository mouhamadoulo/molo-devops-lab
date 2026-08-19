package com.molo.devopsstore.product.infrastructure;

import com.molo.devopsstore.product.application.ObjectStorage;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        name = "app.storage.initialize-bucket",
        havingValue = "true",
        matchIfMissing = true)
public class ObjectStorageInitializer implements ApplicationRunner {

    private final ObjectStorage objectStorage;

    public ObjectStorageInitializer(ObjectStorage objectStorage) {
        this.objectStorage = objectStorage;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        objectStorage.ensureBucket();
    }
}
