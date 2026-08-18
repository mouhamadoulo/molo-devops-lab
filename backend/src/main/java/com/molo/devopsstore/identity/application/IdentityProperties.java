package com.molo.devopsstore.identity.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.identity")
public record IdentityProperties(
        String bootstrapAdminEmail,
        String bootstrapAdminPassword,
        String bootstrapAdminName) {
}
