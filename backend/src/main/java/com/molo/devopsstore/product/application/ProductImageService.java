package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.api.dto.ProductImageResponse;
import com.molo.devopsstore.product.domain.ProductImage;
import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class ProductImageService {

    private static final int MAX_IMAGES = 5;
    private static final Logger LOGGER = LoggerFactory.getLogger(ProductImageService.class);

    private final ProductRepository productRepository;
    private final ProductImageRepository imageRepository;
    private final ObjectStorage objectStorage;
    private final ImageInspector imageInspector;
    private final ProductImageMapper productImageMapper;
    private final ApplicationEventPublisher eventPublisher;

    public ProductImageService(
            ProductRepository productRepository,
            ProductImageRepository imageRepository,
            ObjectStorage objectStorage,
            ImageInspector imageInspector,
            ProductImageMapper productImageMapper,
            ApplicationEventPublisher eventPublisher) {
        this.productRepository = productRepository;
        this.imageRepository = imageRepository;
        this.objectStorage = objectStorage;
        this.imageInspector = imageInspector;
        this.productImageMapper = productImageMapper;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public ProductImageResponse upload(
            long productId,
            InputStream content,
            String declaredContentType) {
        var inspected = imageInspector.inspect(content, declaredContentType);
        var product = productRepository.findByIdForUpdate(productId)
                .orElseThrow(() -> new ProductNotFoundException(productId));
        var images = imageRepository.findByProductIdForUpdate(productId);
        if (images.size() >= MAX_IMAGES) {
            throw new ImageLimitExceededException(productId);
        }

        var position = firstAvailablePosition(images);
        var objectKey = "products/" + productId + "/" + UUID.randomUUID();
        var stored = put(objectKey, inspected);
        var compensationAttempted = registerRollbackCompensation(stored.objectKey());
        var image = ProductImage.create(
                product,
                stored.objectKey(),
                inspected.contentType(),
                inspected.sizeBytes(),
                inspected.width(),
                inspected.height(),
                position,
                images.isEmpty());

        try {
            return productImageMapper.toResponse(imageRepository.saveAndFlush(image));
        } catch (RuntimeException persistenceFailure) {
            compensate(stored.objectKey(), persistenceFailure, compensationAttempted);
            throw persistenceFailure;
        }
    }

    @Transactional(readOnly = true)
    public List<ProductImageResponse> list(long productId) {
        if (!productRepository.existsById(productId)) {
            throw new ProductNotFoundException(productId);
        }
        return imageRepository.findByProductIdOrderByPosition(productId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public List<ProductImageResponse> reorder(long productId, List<Long> imageIds) {
        var images = lockedGallery(productId);
        validateOrder(productId, images, imageIds);
        var imagesById = new HashMap<Long, ProductImage>();
        images.forEach(image -> imagesById.put(image.getId(), image));
        for (var position = 0; position < imageIds.size(); position++) {
            imagesById.get(imageIds.get(position)).moveTo(position);
        }
        imageRepository.saveAllAndFlush(images);
        return imageIds.stream()
                .map(imagesById::get)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ProductImageResponse makePrimary(long productId, long imageId) {
        var images = lockedGallery(productId);
        var target = findImage(productId, imageId, images);
        if (!target.isPrimary()) {
            images.stream()
                    .filter(ProductImage::isPrimary)
                    .forEach(ProductImage::clearPrimary);
            imageRepository.saveAllAndFlush(images);
            target.makePrimary();
            imageRepository.saveAndFlush(target);
        }
        return productImageMapper.toResponse(target);
    }

    @Transactional
    public void delete(long productId, long imageId) {
        var images = lockedGallery(productId);
        var image = findImage(productId, imageId, images);
        var wasPrimary = image.isPrimary();
        var remaining = images.stream()
                .filter(candidate -> !candidate.getId().equals(imageId))
                .toList();

        if (wasPrimary) {
            image.clearPrimary();
            imageRepository.saveAndFlush(image);
        }
        imageRepository.delete(image);
        imageRepository.flush();

        if (wasPrimary && !remaining.isEmpty()) {
            var next = remaining.getFirst();
            next.makePrimary();
            imageRepository.saveAndFlush(next);
        }
        eventPublisher.publishEvent(new ObjectDeletionRequested(image.getObjectKey()));
    }

    private StoredObject put(String objectKey, ImageInspector.InspectedImage image) {
        try {
            return objectStorage.put(
                    objectKey,
                    new ByteArrayInputStream(image.content()),
                    image.sizeBytes(),
                    image.contentType());
        } catch (StorageException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new StorageException("Product image could not be stored", exception);
        }
    }

    private AtomicBoolean registerRollbackCompensation(String objectKey) {
        var compensationAttempted = new AtomicBoolean();
        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCompletion(int status) {
                            if (status == STATUS_ROLLED_BACK
                                    && compensationAttempted.compareAndSet(false, true)) {
                                compensateAfterRollback(objectKey);
                            }
                        }
                    });
        }
        return compensationAttempted;
    }

    private void compensate(
            String objectKey,
            RuntimeException persistenceFailure,
            AtomicBoolean compensationAttempted) {
        if (!compensationAttempted.compareAndSet(false, true)) {
            return;
        }
        try {
            objectStorage.delete(objectKey);
        } catch (RuntimeException compensationFailure) {
            persistenceFailure.addSuppressed(compensationFailure);
        }
    }

    private void compensateAfterRollback(String objectKey) {
        try {
            objectStorage.delete(objectKey);
        } catch (RuntimeException exception) {
            LOGGER.warn("Upload rollback compensation failed for key {}", objectKey, exception);
        }
    }

    private int firstAvailablePosition(List<ProductImage> images) {
        for (var candidate = 0; candidate < MAX_IMAGES; candidate++) {
            var position = candidate;
            if (images.stream().noneMatch(image -> image.getPosition() == position)) {
                return position;
            }
        }
        throw new IllegalStateException("No product image position is available");
    }

    private ProductImageResponse toResponse(ProductImage image) {
        return productImageMapper.toResponse(image);
    }

    private List<ProductImage> lockedGallery(long productId) {
        productRepository.findByIdForUpdate(productId)
                .orElseThrow(() -> new ProductNotFoundException(productId));
        return imageRepository.findByProductIdForUpdate(productId);
    }

    private void validateOrder(
            long productId,
            List<ProductImage> images,
            List<Long> imageIds) {
        if (imageIds == null || imageIds.size() != images.size()) {
            throw new InvalidImageOrderException(productId);
        }
        var requestedIds = new HashSet<>(imageIds);
        var existingIds = images.stream()
                .map(ProductImage::getId)
                .collect(java.util.stream.Collectors.toSet());
        if (requestedIds.size() != imageIds.size() || !requestedIds.equals(existingIds)) {
            throw new InvalidImageOrderException(productId);
        }
    }

    private ProductImage findImage(
            long productId,
            long imageId,
            List<ProductImage> images) {
        return images.stream()
                .filter(image -> image.getId().equals(imageId))
                .findFirst()
                .orElseThrow(() -> new ProductImageNotFoundException(productId, imageId));
    }
}
