package com.molo.devopsstore.product.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ObjectDeletionListener {

    private static final int MAX_ATTEMPTS = 3;
    private static final Logger LOGGER = LoggerFactory.getLogger(ObjectDeletionListener.class);

    private final ObjectStorage objectStorage;
    private final Counter retries;
    private final Counter failures;

    public ObjectDeletionListener(ObjectStorage objectStorage, MeterRegistry meterRegistry) {
        this.objectStorage = objectStorage;
        this.retries = meterRegistry.counter("product.images.storage.deletion.retries");
        this.failures = meterRegistry.counter("product.images.storage.deletion.failures");
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onDeletionRequested(ObjectDeletionRequested event) {
        deleteWithRetry(event.objectKey());
    }

    boolean deleteWithRetry(String objectKey) {
        for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (attempt > 1) {
                retries.increment();
            }
            try {
                objectStorage.delete(objectKey);
                return true;
            } catch (RuntimeException exception) {
                if (attempt == MAX_ATTEMPTS) {
                    failures.increment();
                    LOGGER.warn(
                            "Object deletion failed after {} attempts for key {}",
                            MAX_ATTEMPTS,
                            objectKey,
                            exception);
                }
            }
        }
        return false;
    }
}
