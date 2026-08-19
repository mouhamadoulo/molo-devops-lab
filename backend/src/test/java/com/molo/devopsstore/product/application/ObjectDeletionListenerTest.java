package com.molo.devopsstore.product.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.domain.ProductImage;
import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class ObjectDeletionListenerTest {

    private static final String OBJECT_KEY = "products/42/deleted-object";

    @Test
    void deletesOnlyAfterThePublishingTransactionCommits() {
        var storage = mock(ObjectStorage.class);

        publishWithinTransaction(storage, TransactionSynchronization.STATUS_COMMITTED, () ->
                verify(storage, never()).delete(OBJECT_KEY));

        verify(storage).delete(OBJECT_KEY);
    }

    @Test
    void neverDeletesWhenThePublishingTransactionRollsBack() {
        var storage = mock(ObjectStorage.class);

        publishWithinTransaction(storage, TransactionSynchronization.STATUS_ROLLED_BACK, () ->
                verify(storage, never()).delete(OBJECT_KEY));

        verify(storage, never()).delete(OBJECT_KEY);
    }

    @Test
    void retriesAStorageFailureThreeTimesAndRecordsMetrics() {
        var storage = mock(ObjectStorage.class);
        var registry = new SimpleMeterRegistry();
        var listener = new ObjectDeletionListener(storage, registry);
        doThrow(new StorageException("first", new RuntimeException()))
                .doThrow(new StorageException("second", new RuntimeException()))
                .doNothing()
                .when(storage).delete(OBJECT_KEY);

        assertThat(listener.deleteWithRetry(OBJECT_KEY)).isTrue();

        verify(storage, org.mockito.Mockito.times(3)).delete(OBJECT_KEY);
        assertThat(registry.counter("product.images.storage.deletion.retries").count())
                .isEqualTo(2.0);
        assertThat(registry.counter("product.images.storage.deletion.failures").count())
                .isZero();
    }

    @Test
    void recordsTheFinalFailureAfterExhaustingRetries() {
        var storage = mock(ObjectStorage.class);
        var registry = new SimpleMeterRegistry();
        var listener = new ObjectDeletionListener(storage, registry);
        doThrow(new StorageException("unavailable", new RuntimeException()))
                .when(storage).delete(OBJECT_KEY);

        assertThat(listener.deleteWithRetry(OBJECT_KEY)).isFalse();

        verify(storage, org.mockito.Mockito.times(3)).delete(OBJECT_KEY);
        assertThat(registry.counter("product.images.storage.deletion.retries").count())
                .isEqualTo(2.0);
        assertThat(registry.counter("product.images.storage.deletion.failures").count())
                .isEqualTo(1.0);
    }

    @Test
    void publishesEveryImageKeyBeforeDeletingAProduct() {
        var productRepository = mock(ProductRepository.class);
        var imageRepository = mock(ProductImageRepository.class);
        var publisher = mock(ApplicationEventPublisher.class);
        var product = Product.create(
                "Product", "Fixture", ProductCategory.OTHER,
                BigDecimal.TEN, 1, true);
        var first = image(product, "products/42/first", 0, true);
        var second = image(product, "products/42/second", 1, false);
        when(productRepository.findById(42L)).thenReturn(Optional.of(product));
        when(imageRepository.findByProductIdOrderByPosition(42L))
                .thenReturn(List.of(first, second));
        var service = new ProductService(
                productRepository,
                imageRepository,
                new ProductMapper(),
                mock(ProductImageMapper.class),
                new SimpleMeterRegistry(),
                publisher);

        service.delete(42L);

        verify(publisher).publishEvent(new ObjectDeletionRequested("products/42/first"));
        verify(publisher).publishEvent(new ObjectDeletionRequested("products/42/second"));
        verify(productRepository).delete(product);
    }

    private void publishWithinTransaction(
            ObjectStorage storage,
            int completionStatus,
            Runnable beforeCompletionAssertion) {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(ObjectStorage.class, () -> storage);
            context.registerBean(SimpleMeterRegistry.class, SimpleMeterRegistry::new);
            context.registerBean(
                    TransactionalEventListenerFactory.class,
                    TransactionalEventListenerFactory::new);
            context.register(ObjectDeletionListener.class);
            context.refresh();
            TransactionSynchronizationManager.setActualTransactionActive(true);
            TransactionSynchronizationManager.initSynchronization();
            try {
                context.publishEvent(new ObjectDeletionRequested(OBJECT_KEY));
                beforeCompletionAssertion.run();
                var synchronizations = TransactionSynchronizationManager.getSynchronizations();
                assertThat(synchronizations).isNotEmpty();
                if (completionStatus == TransactionSynchronization.STATUS_COMMITTED) {
                    synchronizations.forEach(synchronization -> synchronization.beforeCommit(false));
                }
                synchronizations.forEach(TransactionSynchronization::beforeCompletion);
                if (completionStatus == TransactionSynchronization.STATUS_COMMITTED) {
                    synchronizations.forEach(TransactionSynchronization::afterCommit);
                }
                synchronizations.forEach(synchronization ->
                        synchronization.afterCompletion(completionStatus));
            } finally {
                TransactionSynchronizationManager.clearSynchronization();
                TransactionSynchronizationManager.setActualTransactionActive(false);
            }
        }
    }

    private ProductImage image(
            Product product,
            String objectKey,
            int position,
            boolean primary) {
        return ProductImage.create(
                product, objectKey, "image/png", 100, 2, 2, position, primary);
    }
}
