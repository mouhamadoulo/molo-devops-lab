package com.molo.devopsstore.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@ExtendWith(MockitoExtension.class)
class BootstrapAdminTest {

    @Mock
    private AppUserRepository appUserRepository;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void createsAnEnabledAdminWithNormalizedEmailAndBcryptPassword() {
        var properties = new IdentityProperties(
                " Initial.Admin@Example.COM ",
                "local-test-password",
                " Initial Admin ");
        var bootstrapAdmin = new BootstrapAdmin(appUserRepository, passwordEncoder, properties);
        when(appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN)).thenReturn(false);

        bootstrapAdmin.initialize();

        var captor = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(captor.capture());
        var admin = captor.getValue();
        assertThat(admin.getEmail()).isEqualTo("initial.admin@example.com");
        assertThat(admin.getDisplayName()).isEqualTo("Initial Admin");
        assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(admin.isEnabled()).isTrue();
        assertThat(passwordEncoder.matches("local-test-password", admin.getPasswordHash())).isTrue();
        assertThat(admin.getPasswordHash()).doesNotContain("local-test-password");
    }

    @Test
    void remainsIdempotentWhenAnAdminExistsAfterTheFirstRun() {
        var properties = new IdentityProperties(
                "admin@example.com",
                "local-test-password",
                "Admin");
        var bootstrapAdmin = new BootstrapAdmin(appUserRepository, passwordEncoder, properties);
        when(appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN))
                .thenReturn(false, true);

        bootstrapAdmin.initialize();
        bootstrapAdmin.initialize();

        verify(appUserRepository).save(org.mockito.ArgumentMatchers.any(AppUser.class));
    }

    @Test
    void namesTheMissingBootstrapVariableWithoutLeakingOtherValues() {
        var properties = new IdentityProperties("", "do-not-leak-this-value", "Initial Admin");
        var bootstrapAdmin = new BootstrapAdmin(appUserRepository, passwordEncoder, properties);
        when(appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN)).thenReturn(false);

        assertThatThrownBy(bootstrapAdmin::initialize)
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Missing required environment variable: BOOTSTRAP_ADMIN_EMAIL")
                .message()
                .doesNotContain("do-not-leak-this-value");
    }

    @Test
    void allowsStartupWithoutBootstrapValuesWhenAnEnabledAdminAlreadyExists() {
        var bootstrapAdmin = new BootstrapAdmin(
                appUserRepository,
                passwordEncoder,
                new IdentityProperties("", "", ""));
        when(appUserRepository.existsByRoleAndEnabledTrue(UserRole.ADMIN)).thenReturn(true);

        bootstrapAdmin.initialize();

        verify(appUserRepository, never()).save(org.mockito.ArgumentMatchers.any(AppUser.class));
    }
}
