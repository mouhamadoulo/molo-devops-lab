package com.molo.devopsstore.identity.application;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.identity.auth")
public record AuthProperties(
        Duration refreshTokenTtl,
        boolean cookieSecure) {

    public AuthProperties {
        if (refreshTokenTtl == null || refreshTokenTtl.isZero() || refreshTokenTtl.isNegative()) {
            throw new IllegalArgumentException("Refresh token TTL must be positive");
        }
    }
}
