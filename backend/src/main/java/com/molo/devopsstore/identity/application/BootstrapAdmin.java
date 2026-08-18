package com.molo.devopsstore.identity.application;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class BootstrapAdmin implements ApplicationRunner {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final IdentityProperties properties;

    public BootstrapAdmin(
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder,
            IdentityProperties properties) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        initialize();
    }

    void initialize() {
        if (appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN)) {
            return;
        }

        var email = requireBootstrapValue(
                properties.bootstrapAdminEmail(),
                "BOOTSTRAP_ADMIN_EMAIL");
        var password = requireBootstrapValue(
                properties.bootstrapAdminPassword(),
                "BOOTSTRAP_ADMIN_PASSWORD");
        var displayName = requireBootstrapValue(
                properties.bootstrapAdminName(),
                "BOOTSTRAP_ADMIN_NAME");

        appUserRepository.save(AppUser.create(
                email,
                displayName,
                passwordEncoder.encode(password),
                UserRole.ADMIN));
    }

    private static String requireBootstrapValue(String value, String variableName) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing required environment variable: " + variableName);
        }
        return value;
    }
}
