package com.molo.devopsstore.identity.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
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
class AuthApiIntegrationTest {

    private static final String ORIGIN = "http://localhost:4200";
    private static final Pattern ACCESS_TOKEN =
            Pattern.compile("\\\"accessToken\\\":\\\"([^\\\"]+)\\\"");

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

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Test
    void logsInRotatesReadsTheCurrentUserAndLogsOut() throws Exception {
        var login = send(HttpRequest.newBuilder(uri("/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .header("Origin", ORIGIN)
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {"email":"integration.admin@example.com",
                         "password":"local-integration-test-password"}
                        """))
                .build());

        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.headers().firstValue("Access-Control-Allow-Origin")).contains(ORIGIN);
        assertThat(login.headers().firstValue("Access-Control-Allow-Credentials")).contains("true");
        assertThat(login.body())
                .contains("\"email\":\"integration.admin@example.com\"")
                .contains("\"role\":\"ADMIN\"")
                .doesNotContain("password");
        var accessToken = accessToken(login.body());
        var refreshToken = cookie(login, "DEVOPS_REFRESH");
        var xsrfToken = cookie(login, "XSRF-TOKEN");
        assertCookieAttributes(login, "DEVOPS_REFRESH", "HttpOnly", "SameSite=Strict", "Path=/api/v1/auth");
        assertCookieAttributes(login, "XSRF-TOKEN", "SameSite=Strict", "Path=/");

        var me = send(HttpRequest.newBuilder(uri("/api/v1/auth/me"))
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build());
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains("integration.admin@example.com", "ADMIN");

        var refresh = send(HttpRequest.newBuilder(uri("/api/v1/auth/refresh"))
                .header("Origin", ORIGIN)
                .header("Cookie", cookies(refreshToken, xsrfToken))
                .header("X-XSRF-TOKEN", xsrfToken)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());
        assertThat(refresh.statusCode()).isEqualTo(200);
        var rotatedRefresh = cookie(refresh, "DEVOPS_REFRESH");
        var rotatedXsrf = cookie(refresh, "XSRF-TOKEN");
        assertThat(rotatedRefresh).isNotEqualTo(refreshToken);

        var reuse = send(HttpRequest.newBuilder(uri("/api/v1/auth/refresh"))
                .header("Origin", ORIGIN)
                .header("Cookie", cookies(refreshToken, xsrfToken))
                .header("X-XSRF-TOKEN", xsrfToken)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());
        assertThat(reuse.statusCode()).isEqualTo(401);

        var revokedDescendant = send(HttpRequest.newBuilder(uri("/api/v1/auth/refresh"))
                .header("Origin", ORIGIN)
                .header("Cookie", cookies(rotatedRefresh, rotatedXsrf))
                .header("X-XSRF-TOKEN", rotatedXsrf)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());
        assertThat(revokedDescendant.statusCode()).isEqualTo(401);

        var logout = send(HttpRequest.newBuilder(uri("/api/v1/auth/logout"))
                .header("Origin", ORIGIN)
                .header("Cookie", cookies(rotatedRefresh, rotatedXsrf))
                .header("X-XSRF-TOKEN", rotatedXsrf)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());
        assertThat(logout.statusCode()).isEqualTo(204);
        assertCookieAttributes(logout, "DEVOPS_REFRESH", "Max-Age=0");
        assertCookieAttributes(logout, "XSRF-TOKEN", "Max-Age=0");
    }

    @Test
    void returnsGenericErrorsAndRejectsUntrustedOriginsOrMissingXsrf() throws Exception {
        var invalid = send(HttpRequest.newBuilder(uri("/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .header("Origin", ORIGIN)
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {"email":"unknown@example.com","password":"wrong-password"}
                        """))
                .build());
        assertThat(invalid.statusCode()).isEqualTo(401);
        assertThat(invalid.body())
                .contains("Invalid credentials")
                .doesNotContain("unknown@example.com", "wrong-password");

        var untrustedOrigin = send(HttpRequest.newBuilder(uri("/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .header("Origin", "https://untrusted.example")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build());
        assertThat(untrustedOrigin.statusCode()).isEqualTo(403);

        var missingXsrf = send(HttpRequest.newBuilder(uri("/api/v1/auth/refresh"))
                .header("Origin", ORIGIN)
                .header("Cookie", "DEVOPS_REFRESH=invalid")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());
        assertThat(missingXsrf.statusCode()).isEqualTo(403);
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private static String accessToken(String body) {
        var matcher = ACCESS_TOKEN.matcher(body);
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private static String cookie(HttpResponse<String> response, String name) {
        return response.headers().allValues("Set-Cookie").stream()
                .filter(value -> value.startsWith(name + "="))
                .map(value -> value.substring(name.length() + 1, value.indexOf(';')))
                .findFirst()
                .orElseThrow();
    }

    private static String cookies(String refreshToken, String xsrfToken) {
        return "DEVOPS_REFRESH=" + refreshToken + "; XSRF-TOKEN=" + xsrfToken;
    }

    private static void assertCookieAttributes(
            HttpResponse<String> response,
            String name,
            String... attributes) {
        var header = response.headers().allValues("Set-Cookie").stream()
                .filter(value -> value.startsWith(name + "="))
                .findFirst()
                .orElseThrow();
        assertThat(header).contains(attributes);
    }
}
