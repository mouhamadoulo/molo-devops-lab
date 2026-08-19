package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.api.dto.CreateProductRequest;
import com.molo.devopsstore.product.api.dto.PageResponse;
import com.molo.devopsstore.product.api.dto.ProductImageResponse;
import com.molo.devopsstore.product.api.dto.ProductResponse;
import com.molo.devopsstore.product.api.dto.UpdateProductRequest;
import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import com.molo.devopsstore.product.infrastructure.ProductSpecifications;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

    private static final Set<String> ALLOWED_SORT_PROPERTIES = Set.of(
            "name", "price", "category", "stockQuantity", "available", "createdAt", "updatedAt");

    private final ProductRepository productRepository;
    private final ProductImageRepository imageRepository;
    private final ProductMapper productMapper;
    private final ProductImageMapper productImageMapper;
    private final Counter productsCreated;
    private final ApplicationEventPublisher eventPublisher;

    public ProductService(
            ProductRepository productRepository,
            ProductImageRepository imageRepository,
            ProductMapper productMapper,
            ProductImageMapper productImageMapper,
            MeterRegistry meterRegistry,
            ApplicationEventPublisher eventPublisher) {
        this.productRepository = productRepository;
        this.imageRepository = imageRepository;
        this.productMapper = productMapper;
        this.productImageMapper = productImageMapper;
        this.productsCreated = meterRegistry.counter("products.created.events");
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public ProductResponse create(CreateProductRequest request) {
        var product = Product.create(
                request.name(),
                request.description(),
                request.category(),
                request.price(),
                request.stockQuantity(),
                request.available());
        var savedProduct = productRepository.save(product);
        productsCreated.increment();
        return productMapper.toResponse(savedProduct);
    }

    @Transactional(readOnly = true)
    public ProductResponse getById(long id) {
        var product = findProduct(id);
        var primaryImage = imageRepository.findByProductIdAndPrimaryTrue(id)
                .map(productImageMapper::toResponse)
                .orElse(null);
        return productMapper.toResponse(product, primaryImage);
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductResponse> list(
            String search,
            ProductCategory category,
            Boolean available,
            Pageable pageable) {
        validateSort(pageable);
        var products = productRepository.findAll(
                ProductSpecifications.matching(search, category, available), pageable);
        var productIds = products.stream()
                .map(Product::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        var primaryImages = productIds.isEmpty()
                ? Map.<Long, ProductImageResponse>of()
                : imageRepository.findByProductIdInAndPrimaryTrue(productIds).stream()
                        .collect(Collectors.toMap(
                                image -> image.getProduct().getId(),
                                productImageMapper::toResponse));
        return PageResponse.from(products.map(product -> productMapper.toResponse(
                product,
                product.getId() == null ? null : primaryImages.get(product.getId()))));
    }

    @Transactional
    public ProductResponse update(long id, UpdateProductRequest request) {
        var product = findProduct(id);
        product.update(
                request.name(),
                request.description(),
                request.category(),
                request.price(),
                request.stockQuantity(),
                request.available());
        var primaryImage = imageRepository.findByProductIdAndPrimaryTrue(id)
                .map(productImageMapper::toResponse)
                .orElse(null);
        return productMapper.toResponse(product, primaryImage);
    }

    @Transactional
    public void delete(long id) {
        var product = findProduct(id);
        imageRepository.findByProductIdOrderByPosition(id).stream()
                .map(image -> new ObjectDeletionRequested(image.getObjectKey()))
                .forEach(eventPublisher::publishEvent);
        productRepository.delete(product);
    }

    private Product findProduct(long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
    }

    private void validateSort(Pageable pageable) {
        pageable.getSort().forEach(order -> {
            if (!ALLOWED_SORT_PROPERTIES.contains(order.getProperty())) {
                throw new InvalidProductSortException(order.getProperty());
            }
        });
    }
}
