package com.molo.devopsstore.product.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.identity.application.AccessTokenService;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.product.application.ObjectStorage;
import com.molo.devopsstore.product.application.StorageException;
import com.molo.devopsstore.product.application.StoredObject;
import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.domain.ProductImage;
import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@Import(ProductImageApiIntegrationTest.StorageTestConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProductImageApiIntegrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(DockerImageName.parse("postgres:18.4-alpine"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private AccessTokenService accessTokenService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductImageRepository imageRepository;

    @Autowired
    private ObjectStorage objectStorage;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private Product product;

    @BeforeEach
    void setUp() {
        imageRepository.deleteAll();
        productRepository.deleteAll();
        product = productRepository.saveAndFlush(Product.create(
                "Image API product",
                "Integration fixture",
                ProductCategory.OTHER,
                new BigDecimal("49.90"),
                3,
                true));

        reset(objectStorage);
        when(objectStorage.put(anyString(), any(), anyLong(), anyString()))
                .thenAnswer(invocation -> new StoredObject(invocation.getArgument(0), "etag"));
        when(objectStorage.presignGet(anyString(), any(Duration.class)))
                .thenAnswer(invocation -> URI.create(
                        "https://objects.test/" + invocation.getArgument(0) + "?expires=300"));
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsEveryRoleToListImages(UserRole role) throws Exception {
        var image = saveImage(0, true);

        var response = send(role, "GET", imageCollectionPath(), null, null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"id\":" + image.getId(), "https://objects.test/")
                .doesNotContain("\"objectKey\"");
        verify(objectStorage).presignGet(image.getObjectKey(), Duration.ofMinutes(5));
    }

    @Test
    void includesOnlyThePrimaryImageInTheProductList() throws Exception {
        var primary = saveImage(0, true);
        var secondary = saveImage(1, false);

        var response = send(
                UserRole.VIEWER,
                "GET",
                "/api/v1/products?search=Image%20API%20product",
                null,
                null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"primaryImage\"", primary.getObjectKey())
                .doesNotContain(secondary.getObjectKey());
        verify(objectStorage).presignGet(primary.getObjectKey(), Duration.ofMinutes(5));
        verify(objectStorage, never())
                .presignGet(secondary.getObjectKey(), Duration.ofMinutes(5));
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsOnlyEditorsAndAdministratorsToUpload(UserRole role) throws Exception {
        var response = upload(role, image("png", 3, 2));

        assertThat(response.statusCode()).isEqualTo(role == UserRole.VIEWER ? 403 : 201);
        if (role != UserRole.VIEWER) {
            assertThat(response.body()).contains("image/png", "https://objects.test/");
        }
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void protectsReorderPrimaryAndDeleteMutations(UserRole role) throws Exception {
        var image = saveImage(0, true);
        var expected = role == UserRole.VIEWER ? 403 : 200;

        assertThat(send(role, "PUT", imageCollectionPath() + "/order",
                "{\"imageIds\":[" + image.getId() + "]}", "application/json").statusCode())
                .isEqualTo(expected);
        assertThat(send(role, "PUT", imageCollectionPath() + "/" + image.getId() + "/primary",
                null, null).statusCode()).isEqualTo(expected);
        assertThat(send(role, "DELETE", imageCollectionPath() + "/" + image.getId(),
                null, null).statusCode()).isEqualTo(role == UserRole.VIEWER ? 403 : 204);
    }

    @Test
    void reordersOnlyWhenTheRequestContainsExactlyTheExistingIds() throws Exception {
        var first = saveImage(0, true);
        var second = saveImage(1, false);
        var third = saveImage(2, false);
        var reverseOrder = "{\"imageIds\":[%d,%d,%d]}"
                .formatted(third.getId(), second.getId(), first.getId());

        var reordered = send(UserRole.EDITOR, "PUT", imageCollectionPath() + "/order",
                reverseOrder, "application/json");

        assertThat(reordered.statusCode()).isEqualTo(200);
        assertThat(imageRepository.findByProductIdOrderByPosition(product.getId()))
                .extracting(ProductImage::getId)
                .containsExactly(third.getId(), second.getId(), first.getId());

        var invalid = send(UserRole.EDITOR, "PUT", imageCollectionPath() + "/order",
                "{\"imageIds\":[" + first.getId() + "]}", "application/json");
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(invalid.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(invalid.body())
                .contains("/problems/invalid-image-order", "requestId");
    }

    @Test
    void promotesTheFirstRemainingImageWhenDeletingThePrimary() throws Exception {
        var primary = saveImage(0, true);
        var next = saveImage(1, false);

        var response = send(UserRole.ADMIN, "DELETE",
                imageCollectionPath() + "/" + primary.getId(), null, null);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(imageRepository.findById(primary.getId())).isEmpty();
        assertThat(imageRepository.findById(next.getId()).orElseThrow().isPrimary()).isTrue();
    }

    @Test
    void keepsDeletedMetadataInaccessibleWhenStorageDeletionExhaustsRetries() throws Exception {
        var image = saveImage(0, true);
        doThrow(new StorageException("storage unavailable", new RuntimeException()))
                .when(objectStorage).delete(image.getObjectKey());

        var deletion = send(UserRole.ADMIN, "DELETE",
                imageCollectionPath() + "/" + image.getId(), null, null);
        var gallery = send(UserRole.VIEWER, "GET", imageCollectionPath(), null, null);

        assertThat(deletion.statusCode()).isEqualTo(204);
        assertThat(imageRepository.findById(image.getId())).isEmpty();
        assertThat(gallery.statusCode()).isEqualTo(200);
        assertThat(gallery.body()).isEqualTo("[]");
        verify(objectStorage, times(3)).delete(image.getObjectKey());
    }

    @Test
    void deletesAProductTogetherWithItsImagesAndStoredObjects() throws Exception {
        var primary = saveImage(0, true);
        var secondary = saveImage(1, false);

        var response = send(UserRole.ADMIN, "DELETE",
                "/api/v1/products/" + product.getId(), null, null);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(productRepository.findById(product.getId())).isEmpty();
        assertThat(imageRepository.findByProductIdOrderByPosition(product.getId())).isEmpty();
        verify(objectStorage).delete(primary.getObjectKey());
        verify(objectStorage).delete(secondary.getObjectKey());
    }

    @Test
    void returnsTypedProblemsForUnknownProductsAndImages() throws Exception {
        var unknownProduct = send(UserRole.VIEWER, "GET",
                "/api/v1/products/999999/images", null, null);
        var unknownImage = send(UserRole.EDITOR, "PUT",
                imageCollectionPath() + "/999999/primary", null, null);

        assertThat(unknownProduct.statusCode()).isEqualTo(404);
        assertThat(unknownProduct.body()).contains("/problems/product-not-found");
        assertThat(unknownImage.statusCode()).isEqualTo(404);
        assertThat(unknownImage.body()).contains("/problems/product-image-not-found");
    }

    @Test
    void doesNotPresignBeforeAuthenticationSucceeds() throws Exception {
        saveImage(0, true);

        var request = HttpRequest.newBuilder(uri(imageCollectionPath())).GET().build();
        var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(401);
        verify(objectStorage, never()).presignGet(anyString(), any(Duration.class));
    }

    private HttpResponse<String> upload(UserRole role, byte[] content) throws Exception {
        var boundary = "devops-store-" + UUID.randomUUID();
        var body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"untrusted.svg\"\r\n"
                + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(content);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return sendBytes(
                role,
                "POST",
                imageCollectionPath(),
                body.toByteArray(),
                "multipart/form-data; boundary=" + boundary);
    }

    private HttpResponse<String> send(
            UserRole role,
            String method,
            String path,
            String body,
            String contentType) throws Exception {
        return sendBytes(
                role,
                method,
                path,
                body == null ? null : body.getBytes(StandardCharsets.UTF_8),
                contentType);
    }

    private HttpResponse<String> sendBytes(
            UserRole role,
            String method,
            String path,
            byte[] body,
            String contentType) throws Exception {
        var builder = HttpRequest.newBuilder(uri(path))
                .header("Authorization", "Bearer " + token(role))
                .header("X-Request-ID", "product-image-api-test");
        if (contentType != null) {
            builder.header("Content-Type", contentType);
        }
        var publisher = body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body);
        return httpClient.send(
                builder.method(method, publisher).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private String imageCollectionPath() {
        return "/api/v1/products/" + product.getId() + "/images";
    }

    private String token(UserRole role) {
        return accessTokenService.issue(AppUser.create(
                role.name().toLowerCase() + "@images.example.com",
                role.name(),
                "bcrypt-hash",
                role));
    }

    private ProductImage saveImage(int position, boolean primary) {
        return imageRepository.saveAndFlush(ProductImage.create(
                product,
                "products/" + product.getId() + "/" + UUID.randomUUID(),
                "image/png",
                100,
                2,
                2,
                position,
                primary));
    }

    private byte[] image(String format, int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, output)).isTrue();
        return output.toByteArray();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageTestConfiguration {

        @Bean
        @Primary
        ObjectStorage testObjectStorage() {
            return org.mockito.Mockito.mock(ObjectStorage.class);
        }
    }
}
