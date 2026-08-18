package com.molo.devopsstore.identity.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.molo.devopsstore.identity.application.AccessTokenService;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthorizationMatrixIntegrationTest {

    private static final String PRODUCT_BODY = """
            {
              "name":"RBAC product",
              "description":"Authorization matrix",
              "category":"OTHER",
              "price":19.90,
              "stockQuantity":2,
              "available":true
            }
            """;

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
    private AppUserRepository appUserRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsEveryRoleToReadProducts(UserRole role) throws Exception {
        assertThat(send(role, "GET", "/api/v1/products", null).statusCode()).isEqualTo(200);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsOnlyEditorsAndAdministratorsToCreateProducts(UserRole role) throws Exception {
        var response = send(role, "POST", "/api/v1/products", PRODUCT_BODY);

        assertThat(response.statusCode()).isEqualTo(
                role == UserRole.VIEWER ? 403 : 201);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsOnlyEditorsAndAdministratorsToUpdateProducts(UserRole role) throws Exception {
        var product = productRepository.saveAndFlush(Product.create(
                "Before update",
                "RBAC fixture",
                ProductCategory.OTHER,
                BigDecimal.TEN,
                1,
                true));

        var response = send(role, "PUT", "/api/v1/products/" + product.getId(), PRODUCT_BODY);

        assertThat(response.statusCode()).isEqualTo(
                role == UserRole.VIEWER ? 403 : 200);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void allowsOnlyAdministratorsToDeleteProducts(UserRole role) throws Exception {
        var product = productRepository.saveAndFlush(Product.create(
                "Delete " + role,
                "RBAC fixture",
                ProductCategory.OTHER,
                BigDecimal.TEN,
                1,
                true));

        var response = send(role, "DELETE", "/api/v1/products/" + product.getId(), null);

        assertThat(response.statusCode()).isEqualTo(
                role == UserRole.ADMIN ? 204 : 403);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void reservesUserAdministrationForAdministrators(UserRole role) throws Exception {
        var response = send(role, "GET", "/api/v1/users", null);

        assertThat(response.statusCode()).isEqualTo(
                role == UserRole.ADMIN ? 200 : 403);
    }

    @Test
    void letsAnAdministratorManageUsersWithoutExposingPasswordMaterial() throws Exception {
        var createBody = """
                {
                  "email":"managed.viewer@example.com",
                  "displayName":"Managed Viewer",
                  "password":"initial-password",
                  "role":"VIEWER"
                }
                """;

        var created = send(UserRole.ADMIN, "POST", "/api/v1/users", createBody);

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body())
                .contains("managed.viewer@example.com", "Managed Viewer", "VIEWER")
                .doesNotContain("initial-password", "passwordHash", "password");
        var id = appUserRepository.findByEmailIgnoreCase("managed.viewer@example.com")
                .orElseThrow()
                .getId();
        assertThat(passwordEncoder.matches(
                "initial-password",
                appUserRepository.findById(id).orElseThrow().getPasswordHash())).isTrue();

        var updated = send(UserRole.ADMIN, "PUT", "/api/v1/users/" + id, """
                {"displayName":"Managed Editor","role":"EDITOR"}
                """);
        assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(updated.body()).contains("Managed Editor", "EDITOR").doesNotContain("password");

        var disabled = send(
                UserRole.ADMIN,
                "PUT",
                "/api/v1/users/" + id + "/enabled?enabled=false",
                null);
        assertThat(disabled.statusCode()).isEqualTo(200);
        assertThat(disabled.body()).contains("\"enabled\":false").doesNotContain("password");

        var passwordReset = send(UserRole.ADMIN, "PUT", "/api/v1/users/" + id + "/password", """
                {"password":"replacement-password"}
                """);
        assertThat(passwordReset.statusCode()).isEqualTo(204);
        assertThat(passwordEncoder.matches(
                "replacement-password",
                appUserRepository.findById(id).orElseThrow().getPasswordHash())).isTrue();

        var listed = send(UserRole.ADMIN, "GET", "/api/v1/users", null);
        assertThat(listed.statusCode()).isEqualTo(200);
        assertThat(listed.body())
                .contains("managed.viewer@example.com", "Managed Editor")
                .doesNotContain("passwordHash", "replacement-password");

        var duplicate = send(UserRole.ADMIN, "POST", "/api/v1/users", createBody);
        assertThat(duplicate.statusCode()).isEqualTo(409);
    }

    private HttpResponse<String> send(
            UserRole role,
            String method,
            String path,
            String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Authorization", "Bearer " + token(role));
        if (body != null) {
            builder.header("Content-Type", "application/json");
        }
        var publisher = body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body);
        return httpClient.send(
                builder.method(method, publisher).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private String token(UserRole role) {
        return accessTokenService.issue(AppUser.create(
                role.name().toLowerCase() + "@rbac.example.com",
                role.name(),
                "bcrypt-hash",
                role));
    }
}
