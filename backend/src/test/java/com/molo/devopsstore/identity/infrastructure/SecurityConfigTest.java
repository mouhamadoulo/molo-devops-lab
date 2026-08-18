package com.molo.devopsstore.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.molo.devopsstore.identity.application.AccessTokenService;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
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
class SecurityConfigTest {

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
    private JwtDecoder jwtDecoder;

    @Autowired
    private JwtEncoder jwtEncoder;

    @Autowired
    private JwtAuthenticationConverter jwtAuthenticationConverter;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Test
    void keepsHealthPublic() throws Exception {
        var response = send(HttpRequest.newBuilder(uri("/actuator/health"))
                .header("X-Request-ID", "security-health")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
    }

    @Test
    void leavesLoginPublicAndOutsideCsrfProtection() throws Exception {
        var response = send(HttpRequest.newBuilder(uri("/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .header("Origin", "http://localhost:4200")
                .header("X-Request-ID", "security-login")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build());

        assertThat(response.statusCode()).isEqualTo(400);
    }

    @Test
    void rejectsProductsWithoutABearerUsingProblemDetails() throws Exception {
        var response = send(HttpRequest.newBuilder(uri("/api/v1/products"))
                .header("X-Request-ID", "security-unauthorized")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(response.body())
                .contains("\"title\":\"Unauthorized\"")
                .contains("\"status\":401")
                .contains("\"requestId\":\"security-unauthorized\"");
    }

    @Test
    void keepsCookieAuthenticationRoutesCsrfProtectedWithProblemDetails() throws Exception {
        var response = send(HttpRequest.newBuilder(uri("/api/v1/auth/refresh"))
                .header("X-Request-ID", "security-forbidden")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(response.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(response.body())
                .contains("\"title\":\"Forbidden\"")
                .contains("\"status\":403")
                .contains("\"requestId\":\"security-forbidden\"");
    }

    @Test
    void mapsTheRoleClaimToASpringRoleAuthority() {
        var user = AppUser.create(
                "editor@example.com",
                "Editor",
                "bcrypt-hash",
                UserRole.EDITOR);
        var jwt = jwtDecoder.decode(accessTokenService.issue(user));

        var authentication = jwtAuthenticationConverter.convert(jwt);

        assertThat(authentication).isNotNull();
        assertThat(authentication.getAuthorities())
                .extracting(GrantedAuthority::getAuthority)
                .contains("ROLE_EDITOR");
    }

    @Test
    void rejectsASignedTokenFromAnotherIssuer() throws Exception {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer("https://untrusted-issuer.test")
                .subject("admin@example.com")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(900))
                .claim("role", "ADMIN")
                .build();
        var token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                claims)).getTokenValue();

        var response = send(HttpRequest.newBuilder(uri("/api/v1/products"))
                .header("Authorization", "Bearer " + token)
                .header("X-Request-ID", "security-wrong-issuer")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body())
                .contains("\"title\":\"Unauthorized\"")
                .contains("\"requestId\":\"security-wrong-issuer\"");
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
