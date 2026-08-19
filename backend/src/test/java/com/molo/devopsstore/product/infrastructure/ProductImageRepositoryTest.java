package com.molo.devopsstore.product.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.domain.ProductImage;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(properties = "spring.jpa.hibernate.ddl-auto=validate")
@Transactional
class ProductImageRepositoryTest {

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

    @Autowired
    private ProductImageRepository productImageRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearProducts() {
        productImageRepository.deleteAll();
        productRepository.deleteAll();
    }

    @Test
    void deletesImageMetadataWhenProductIsDeleted() {
        var product = saveProduct("Cascade product");
        productImageRepository.saveAndFlush(image(product, "products/1/cascade", 0, true));

        entityManager.clear();
        jdbcTemplate.update("DELETE FROM products WHERE id = ?", product.getId());
        entityManager.clear();

        assertThat(productImageRepository.count()).isZero();
    }

    @Test
    void rejectsDuplicateObjectKeys() {
        var firstProduct = saveProduct("First product");
        var secondProduct = saveProduct("Second product");
        productImageRepository.saveAndFlush(image(firstProduct, "products/shared-key", 0, true));

        assertThatThrownBy(() -> productImageRepository.saveAndFlush(
                image(secondProduct, "products/shared-key", 0, true)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 5})
    void rejectsPositionsOutsideZeroToFour(int position) {
        var product = saveProduct("Position product " + position);

        assertThatThrownBy(() -> productImageRepository.saveAndFlush(
                image(product, "products/position/" + position, position, false)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsDuplicatePositionsForOneProduct() {
        var product = saveProduct("Ordered product");
        productImageRepository.saveAndFlush(image(product, "products/order/first", 0, true));

        assertThatThrownBy(() -> {
            productImageRepository.saveAndFlush(
                    image(product, "products/order/second", 0, false));
            jdbcTemplate.execute(
                    "SET CONSTRAINTS ux_product_images_product_position IMMEDIATE");
        })
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsMoreThanOnePrimaryImageForOneProduct() {
        var product = saveProduct("Primary product");
        productImageRepository.saveAndFlush(image(product, "products/primary/first", 0, true));

        assertThatThrownBy(() -> productImageRepository.saveAndFlush(
                image(product, "products/primary/second", 1, true)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Product saveProduct(String name) {
        return productRepository.saveAndFlush(Product.create(
                name,
                "Product used by repository tests",
                ProductCategory.OTHER,
                new BigDecimal("10.00"),
                1,
                true));
    }

    private ProductImage image(
            Product product,
            String objectKey,
            int position,
            boolean primary) {
        return ProductImage.create(
                product,
                objectKey,
                "image/jpeg",
                1_024,
                100,
                100,
                position,
                primary);
    }
}
