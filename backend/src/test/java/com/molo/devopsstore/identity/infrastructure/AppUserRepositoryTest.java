package com.molo.devopsstore.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
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
class AppUserRepositoryTest {

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
    private AppUserRepository appUserRepository;

    @BeforeEach
    void clearUsers() {
        appUserRepository.deleteAll();
    }

    @Test
    void persistsNormalizedEmailAndFindsItCaseInsensitively() {
        appUserRepository.saveAndFlush(AppUser.create(
                " Admin@Example.COM ",
                "Admin",
                "bcrypt-hash",
                UserRole.ADMIN));

        var found = appUserRepository.findByEmailIgnoreCase("ADMIN@example.com");

        assertThat(found).isPresent();
        assertThat(found.orElseThrow().getEmail()).isEqualTo("admin@example.com");
    }

    @Test
    void enforcesCaseInsensitiveEmailUniquenessInPostgreSql() {
        appUserRepository.saveAndFlush(AppUser.create(
                "admin@example.com",
                "First Admin",
                "bcrypt-hash",
                UserRole.ADMIN));

        assertThatThrownBy(() -> appUserRepository.saveAndFlush(AppUser.create(
                "ADMIN@example.com",
                "Duplicate Admin",
                "bcrypt-hash",
                UserRole.ADMIN)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void countsOnlyEnabledAdministrators() {
        var enabledAdmin = AppUser.create(
                "enabled@example.com", "Enabled", "bcrypt-hash", UserRole.ADMIN);
        var disabledAdmin = AppUser.create(
                "disabled@example.com", "Disabled", "bcrypt-hash", UserRole.ADMIN);
        disabledAdmin.disable();
        var viewer = AppUser.create(
                "viewer@example.com", "Viewer", "bcrypt-hash", UserRole.VIEWER);
        appUserRepository.saveAllAndFlush(java.util.List.of(enabledAdmin, disabledAdmin, viewer));

        assertThat(appUserRepository.countByRoleAndEnabledTrue(UserRole.ADMIN)).isEqualTo(1);
        assertThat(appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN)).isTrue();
    }
}
