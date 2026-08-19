package com.molo.devopsstore.product.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

class OrphanObjectReconcilerTest {

    private static final Instant NOW = Instant.parse("2026-08-19T12:00:00Z");

    @Test
    void waitsOneReconciliationIntervalBeforeTheFirstRun() throws Exception {
        var scheduled = OrphanObjectReconciler.class
                .getMethod("reconcile")
                .getAnnotation(Scheduled.class);

        assertThat(scheduled.initialDelayString())
                .isEqualTo(scheduled.fixedDelayString());
    }

    @Test
    void rejectsANonPositiveOrphanSafetyWindow() {
        assertThatThrownBy(() -> new OrphanObjectReconciler(
                mock(ProductImageRepository.class),
                mock(ObjectStorage.class),
                mock(ObjectDeletionListener.class),
                new SimpleMeterRegistry(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
    }

    @Test
    void deletesOnlyOldOrphansUnderTheProductPrefix() {
        var repository = mock(ProductImageRepository.class);
        var storage = mock(ObjectStorage.class);
        var deletionListener = mock(ObjectDeletionListener.class);
        var registry = new SimpleMeterRegistry();
        var reconciler = new OrphanObjectReconciler(
                repository,
                storage,
                deletionListener,
                registry,
                Clock.fixed(NOW, ZoneOffset.UTC),
                Duration.ofHours(1));
        var referenced = "products/42/referenced";
        var oldOrphan = "products/42/old-orphan";
        var recentOrphan = "products/42/recent-orphan";
        when(repository.findAllObjectKeys()).thenReturn(Set.of(referenced));
        when(storage.list("products/")).thenReturn(List.of(
                new StoredObject(referenced, "etag-1", NOW.minus(Duration.ofDays(2))),
                new StoredObject(oldOrphan, "etag-2", NOW.minus(Duration.ofHours(2))),
                new StoredObject(recentOrphan, "etag-3", NOW.minus(Duration.ofMinutes(30)))));
        when(deletionListener.deleteWithRetry(oldOrphan)).thenReturn(true);

        reconciler.reconcile();

        verify(storage).list("products/");
        verify(deletionListener).deleteWithRetry(oldOrphan);
        verify(deletionListener, never()).deleteWithRetry(referenced);
        verify(deletionListener, never()).deleteWithRetry(recentOrphan);
        assertThat(registry.counter("product.images.storage.orphans.deleted").count())
                .isEqualTo(1.0);
    }
}
