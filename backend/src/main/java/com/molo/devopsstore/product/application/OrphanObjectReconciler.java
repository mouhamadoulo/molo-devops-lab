package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OrphanObjectReconciler {

    private static final String PRODUCT_PREFIX = "products/";

    private final ProductImageRepository imageRepository;
    private final ObjectStorage objectStorage;
    private final ObjectDeletionListener deletionListener;
    private final Clock clock;
    private final Duration safetyWindow;
    private final Counter deletedOrphans;

    public OrphanObjectReconciler(
            ProductImageRepository imageRepository,
            ObjectStorage objectStorage,
            ObjectDeletionListener deletionListener,
            MeterRegistry meterRegistry,
            Clock clock,
            @Value("${app.storage.orphan-min-age:PT24H}") Duration safetyWindow) {
        this.imageRepository = imageRepository;
        this.objectStorage = objectStorage;
        this.deletionListener = deletionListener;
        this.clock = clock;
        this.safetyWindow = requirePositive(safetyWindow);
        this.deletedOrphans = meterRegistry.counter("product.images.storage.orphans.deleted");
    }

    @Scheduled(
            initialDelayString = "${app.storage.orphan-reconciliation-interval:PT1H}",
            fixedDelayString = "${app.storage.orphan-reconciliation-interval:PT1H}")
    @Transactional(readOnly = true)
    public void reconcile() {
        var referencedKeys = imageRepository.findAllObjectKeys();
        var deletionCutoff = clock.instant().minus(safetyWindow);
        objectStorage.list(PRODUCT_PREFIX).stream()
                .filter(object -> !referencedKeys.contains(object.objectKey()))
                .filter(object -> object.lastModified().isBefore(deletionCutoff))
                .map(StoredObject::objectKey)
                .filter(deletionListener::deleteWithRetry)
                .forEach(ignored -> deletedOrphans.increment());
    }

    private Duration requirePositive(Duration duration) {
        Objects.requireNonNull(duration, "safetyWindow must not be null");
        if (duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException("safetyWindow must be positive");
        }
        return duration;
    }
}
