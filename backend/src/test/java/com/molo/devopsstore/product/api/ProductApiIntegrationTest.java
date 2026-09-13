package com.molo.devopsstore.product.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.molo.devopsstore.identity.application.AccessTokenService;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
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
class ProductApiIntegrationTest {

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

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Test
    void createsReadsAndObservesAProductWithRestrictedCors() throws Exception {
        var baseUri = "http://localhost:" + port;
        var createRequest = HttpRequest.newBuilder(URI.create(baseUri + "/api/v1/products"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + adminAccessToken())
                .header("Origin", "http://localhost:4200")
                .header("X-Request-ID", "api-integration-1")
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {
                          "name": "Clavier mécanique",
                          "description": "Clavier pour le laboratoire",
                          "category": "ACCESSORY",
                          "price": 129.90,
                          "stockQuantity": 5,
                          "available": true
                        }
                        """))
                .build();

        var created = httpClient.send(createRequest, HttpResponse.BodyHandlers.ofString());

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.headers().firstValue("Location")).isPresent();
        assertThat(created.headers().firstValue("X-Request-ID")).contains("api-integration-1");
        assertThat(created.headers().firstValue("Access-Control-Allow-Origin"))
                .contains("http://localhost:4200");
        assertThat(created.body()).contains("Clavier mécanique", "ACCESSORY");

        var productLocation = created.headers().firstValue("Location").orElseThrow();
        var product = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + productLocation))
                        .header("Authorization", "Bearer " + adminAccessToken())
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(product.statusCode()).isEqualTo(200);
        assertThat(product.body()).contains("Clavier mécanique");

        var metrics = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + "/actuator/prometheus"))
                        .header("Authorization", "Bearer " + adminAccessToken())
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(metrics.statusCode()).isEqualTo(200);
        assertThat(metrics.body()).contains("products_created_events_total");
        assertThat(metrics.body()).contains("http_server_requests_seconds_bucket");

        var health = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + "/actuator/health")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("\"status\":\"UP\"");

        var openApi = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + "/v3/api-docs"))
                        .header("Authorization", "Bearer " + adminAccessToken())
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(openApi.statusCode()).isEqualTo(200);
        assertThat(openApi.body()).contains("/api/v1/products");

        var hiddenActuatorEndpoint = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + "/actuator/env")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(hiddenActuatorEndpoint.statusCode()).isEqualTo(404);

        var preflight = httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUri + "/api/v1/products"))
                        .header("Origin", "http://localhost:4200")
                        .header("Access-Control-Request-Method", "POST")
                        .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(preflight.statusCode()).isEqualTo(200);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin"))
                .contains("http://localhost:4200");
    }

    private String adminAccessToken() {
        return accessTokenService.issue(AppUser.create(
                "product.integration.admin@example.com",
                "Product Integration Admin",
                "bcrypt-hash",
                UserRole.ADMIN));
    }
}
