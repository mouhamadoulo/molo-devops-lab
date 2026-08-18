package com.molo.devopsstore.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

class AccessTokenServiceTest {

    private static final String SECRET =
            "local-access-token-test-secret-with-at-least-32-bytes";
    private static final Instant NOW = Instant.parse("2026-08-18T12:00:00Z");

    @Test
    void issuesAnHs256TokenWithOnlyTheExpectedClaimsForFifteenMinutes() {
        var key = new SecretKeySpec(
                SECRET.getBytes(StandardCharsets.UTF_8),
                "HmacSHA256");
        var properties = new JwtProperties(
                "https://devops-store.test",
                SECRET,
                Duration.ofMinutes(15));
        var encoder = NimbusJwtEncoder.withSecretKey(key).build();
        var decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(jwt -> OAuth2TokenValidatorResult.success());
        var service = new AccessTokenService(
                encoder,
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC));
        var user = AppUser.create(
                "admin@example.com",
                "Admin",
                "bcrypt-hash",
                UserRole.ADMIN);

        var token = service.issue(user);
        var jwt = decoder.decode(token);

        assertThat(jwt.getHeaders()).containsEntry("alg", "HS256");
        assertThat(jwt.getIssuer()).hasToString("https://devops-store.test");
        assertThat(jwt.getSubject()).isEqualTo("admin@example.com");
        assertThat(jwt.getClaimAsString("role")).isEqualTo("ADMIN");
        assertThat(jwt.getIssuedAt()).isEqualTo(NOW);
        assertThat(jwt.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(15)));
        assertThat(jwt.getClaims()).containsOnlyKeys("iss", "sub", "role", "iat", "exp");
    }

    @Test
    void rejectsASecretShorterThanThirtyTwoUtf8Bytes() {
        assertThatThrownBy(() -> new JwtProperties(
                "https://devops-store.test",
                "secret-too-short",
                Duration.ofMinutes(15)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("32 bytes");
    }
}
