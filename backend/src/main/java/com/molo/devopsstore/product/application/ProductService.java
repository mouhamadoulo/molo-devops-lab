package com.molo.devopsstore.product.application;

import com.molo.devopsstore.product.api.dto.CreateProductRequest;
import com.molo.devopsstore.product.api.dto.PageResponse;
import com.molo.devopsstore.product.api.dto.ProductResponse;
import com.molo.devopsstore.product.api.dto.UpdateProductRequest;
import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import com.molo.devopsstore.product.infrastructure.ProductSpecifications;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Set;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

    private static final Set<String> ALLOWED_SORT_PROPERTIES = Set.of(
            "name", "price", "category", "stockQuantity", "available", "createdAt", "updatedAt");

    private final ProductRepository productRepository;
    private final ProductMapper productMapper;
    private final Counter productsCreated;

    public ProductService(
            ProductRepository productRepository,
            ProductMapper productMapper,
            MeterRegistry meterRegistry) {
        this.productRepository = productRepository;
        this.productMapper = productMapper;
        this.productsCreated = meterRegistry.counter("products.created.events");
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
        return productMapper.toResponse(findProduct(id));
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
        return PageResponse.from(products.map(productMapper::toResponse));
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
        return productMapper.toResponse(product);
    }

    @Transactional
    public void delete(long id) {
        productRepository.delete(findProduct(id));
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
