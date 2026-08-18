package com.molo.devopsstore.product.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.product.api.dto.CreateProductRequest;
import com.molo.devopsstore.product.api.dto.UpdateProductRequest;
import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    private SimpleMeterRegistry meterRegistry;
    private ProductService productService;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        productService = new ProductService(productRepository, new ProductMapper(), meterRegistry);
    }

    @Test
    void createsAndReturnsAProduct() {
        var request = new CreateProductRequest(
                "MacBook Pro",
                "Ordinateur portable professionnel",
                ProductCategory.LAPTOP,
                new BigDecimal("2499.90"),
                4,
                true);
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = productService.create(request);

        assertThat(response.name()).isEqualTo("MacBook Pro");
        assertThat(response.category()).isEqualTo(ProductCategory.LAPTOP);
        assertThat(response.price()).isEqualByComparingTo("2499.90");
        assertThat(response.stockQuantity()).isEqualTo(4);
        assertThat(response.available()).isTrue();
        assertThat(response.createdAt()).isNotNull();
        assertThat(response.updatedAt()).isEqualTo(response.createdAt());
        assertThat(meterRegistry.counter("products.created.events").count()).isEqualTo(1.0);

        var productCaptor = ArgumentCaptor.forClass(Product.class);
        verify(productRepository).save(productCaptor.capture());
        assertThat(productCaptor.getValue().getName()).isEqualTo("MacBook Pro");
    }

    @Test
    void returnsAProductById() {
        var product = Product.create(
                "Casque studio", "Casque fermé", ProductCategory.AUDIO,
                new BigDecimal("159.00"), 8, true);
        when(productRepository.findById(7L)).thenReturn(Optional.of(product));

        var response = productService.getById(7L);

        assertThat(response.name()).isEqualTo("Casque studio");
        assertThat(response.category()).isEqualTo(ProductCategory.AUDIO);
    }

    @Test
    void updatesAnExistingProduct() {
        var product = Product.create(
                "Ancien nom", "Ancienne description", ProductCategory.OTHER,
                new BigDecimal("10.00"), 1, false);
        var createdAt = product.getCreatedAt();
        var request = new UpdateProductRequest(
                "Station d'accueil",
                "Dock USB-C",
                ProductCategory.ACCESSORY,
                new BigDecimal("89.90"),
                12,
                true);
        when(productRepository.findById(12L)).thenReturn(Optional.of(product));

        var response = productService.update(12L, request);

        assertThat(response.name()).isEqualTo("Station d'accueil");
        assertThat(response.description()).isEqualTo("Dock USB-C");
        assertThat(response.category()).isEqualTo(ProductCategory.ACCESSORY);
        assertThat(response.price()).isEqualByComparingTo("89.90");
        assertThat(response.stockQuantity()).isEqualTo(12);
        assertThat(response.available()).isTrue();
        assertThat(response.createdAt()).isEqualTo(createdAt);
        assertThat(response.updatedAt()).isAfterOrEqualTo(createdAt);
    }

    @Test
    void rejectsAnUnknownProduct() {
        when(productRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> productService.getById(404L))
                .isInstanceOf(ProductNotFoundException.class)
                .hasMessage("Product 404 not found");
    }

    @Test
    void deletesAnExistingProduct() {
        var product = Product.create(
                "Tablette", "Tablette de test", ProductCategory.TABLET,
                new BigDecimal("399.00"), 2, true);
        when(productRepository.findById(9L)).thenReturn(Optional.of(product));

        productService.delete(9L);

        verify(productRepository).delete(product);
    }

    @Test
    void rejectsDeletionOfAnUnknownProduct() {
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> productService.delete(99L))
                .isInstanceOf(ProductNotFoundException.class)
                .hasMessage("Product 99 not found");
    }

    @Test
    void returnsAFilteredPageUsingAStableResponseContract() {
        var first = Product.create(
                "MacBook Air", "Portable léger", ProductCategory.LAPTOP,
                new BigDecimal("1299.00"), 3, true);
        var second = Product.create(
                "MacBook Pro", "Portable puissant", ProductCategory.LAPTOP,
                new BigDecimal("2499.00"), 2, true);
        var pageable = PageRequest.of(0, 2, Sort.by("name").ascending());
        when(productRepository.findAll(
                        org.mockito.ArgumentMatchers.<Specification<Product>>any(),
                        any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(first, second), pageable, 5));

        var response = productService.list("mac", ProductCategory.LAPTOP, true, pageable);

        assertThat(response.content()).extracting("name")
                .containsExactly("MacBook Air", "MacBook Pro");
        assertThat(response.page()).isZero();
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5);
        assertThat(response.totalPages()).isEqualTo(3);
        assertThat(response.last()).isFalse();
    }

    @Test
    void rejectsAnUnsupportedSortProperty() {
        var pageable = PageRequest.of(0, 20, Sort.by("description").ascending());

        assertThatThrownBy(() -> productService.list(null, null, null, pageable))
                .isInstanceOf(InvalidProductSortException.class)
                .hasMessage("Unsupported product sort property: description");

        verifyNoInteractions(productRepository);
    }

    @Test
    void exportsTheRequiredProductCreationMetricName() {
        var prometheusRegistry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        var service = new ProductService(productRepository, new ProductMapper(), prometheusRegistry);
        var request = new CreateProductRequest(
                "Souris", "Souris de test", ProductCategory.ACCESSORY,
                new BigDecimal("49.90"), 3, true);
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.create(request);

        assertThat(prometheusRegistry.scrape()).contains("products_created_events_total 1.0");
    }
}
