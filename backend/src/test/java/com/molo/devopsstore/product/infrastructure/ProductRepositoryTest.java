package com.molo.devopsstore.product.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@SpringBootTest(properties = "spring.jpa.hibernate.ddl-auto=validate")
@Transactional
class ProductRepositoryTest {

    @Container
    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(DockerImageName.parse("postgres:18.4-alpine"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private ProductRepository productRepository;

    @BeforeEach
    void clearProducts() {
        productRepository.deleteAll();
    }

    @Test
    void combinesNameCategoryAndAvailabilityFiltersOnPostgreSql() {
        productRepository.save(Product.create(
                "MacBook Air", "Portable léger", ProductCategory.LAPTOP,
                new BigDecimal("1299.00"), 3, true));
        productRepository.save(Product.create(
                "MacBook Pro", "Portable puissant", ProductCategory.LAPTOP,
                new BigDecimal("2499.00"), 0, false));
        productRepository.save(Product.create(
                "Mac Studio", "Ordinateur fixe", ProductCategory.OTHER,
                new BigDecimal("2299.00"), 2, true));

        var page = productRepository.findAll(
                ProductSpecifications.matching("MACBOOK", ProductCategory.LAPTOP, true),
                PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(Product::getName)
                .containsExactly("MacBook Air");
    }
}
