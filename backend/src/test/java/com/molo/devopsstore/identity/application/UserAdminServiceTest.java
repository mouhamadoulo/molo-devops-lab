package com.molo.devopsstore.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.identity.api.dto.CreateUserRequest;
import com.molo.devopsstore.identity.api.dto.ResetPasswordRequest;
import com.molo.devopsstore.identity.api.dto.UpdateUserRequest;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@ExtendWith(MockitoExtension.class)
class UserAdminServiceTest {

    @Mock
    private AppUserRepository repository;

    private BCryptPasswordEncoder passwordEncoder;
    private UserAdminService service;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        service = new UserAdminService(repository, passwordEncoder);
    }

    @Test
    void createsAUserWithNormalizedUniqueEmailAndBcryptPasswordWithoutExposingTheHash() {
        when(repository.existsByEmailIgnoreCase("viewer@example.com")).thenReturn(false);
        when(repository.save(any(AppUser.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(new CreateUserRequest(
                " Viewer@Example.COM ",
                "Viewer One",
                "initial-password",
                UserRole.VIEWER));

        var captor = ArgumentCaptor.forClass(AppUser.class);
        verify(repository).save(captor.capture());
        var saved = captor.getValue();
        assertThat(saved.getEmail()).isEqualTo("viewer@example.com");
        assertThat(passwordEncoder.matches("initial-password", saved.getPasswordHash())).isTrue();
        assertThat(response.email()).isEqualTo("viewer@example.com");
        assertThat(response.toString()).doesNotContain(saved.getPasswordHash(), "initial-password");
    }

    @Test
    void rejectsADuplicateEmailBeforeHashingOrSaving() {
        when(repository.existsByEmailIgnoreCase("admin@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.create(new CreateUserRequest(
                "ADMIN@example.com",
                "Duplicate",
                "initial-password",
                UserRole.ADMIN)))
                .isInstanceOf(DuplicateUserEmailException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void updatesDisplayNameAndRoleWithoutChangingThePasswordHash() {
        var user = AppUser.create(
                "editor@example.com", "Before", "existing-bcrypt-hash", UserRole.EDITOR);
        when(repository.findById(42L)).thenReturn(Optional.of(user));

        var response = service.update(42L, new UpdateUserRequest("After", UserRole.VIEWER));

        assertThat(response.displayName()).isEqualTo("After");
        assertThat(response.role()).isEqualTo(UserRole.VIEWER);
        assertThat(user.getPasswordHash()).isEqualTo("existing-bcrypt-hash");
    }

    @Test
    void refusesToDisableTheCurrentAccount() {
        var current = AppUser.create(
                "admin@example.com", "Admin", "bcrypt-hash", UserRole.ADMIN);
        when(repository.findById(1L)).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> service.setEnabled(1L, false, "ADMIN@example.com"))
                .isInstanceOf(InvalidUserOperationException.class)
                .hasMessageContaining("current account");

        assertThat(current.isEnabled()).isTrue();
    }

    @Test
    void refusesToDisableOrDemoteTheLastActiveAdministrator() {
        var lastAdmin = AppUser.create(
                "last-admin@example.com", "Last Admin", "bcrypt-hash", UserRole.ADMIN);
        when(repository.findById(1L)).thenReturn(Optional.of(lastAdmin));
        when(repository.countByRoleAndEnabledTrue(UserRole.ADMIN)).thenReturn(1L);

        assertThatThrownBy(() -> service.setEnabled(1L, false, "other-admin@example.com"))
                .isInstanceOf(InvalidUserOperationException.class)
                .hasMessageContaining("last active administrator");
        assertThatThrownBy(() -> service.update(
                1L, new UpdateUserRequest("Last Admin", UserRole.EDITOR)))
                .isInstanceOf(InvalidUserOperationException.class)
                .hasMessageContaining("last active administrator");
    }

    @Test
    void resetsThePasswordWithBcrypt() {
        var user = AppUser.create(
                "viewer@example.com", "Viewer", "old-bcrypt-hash", UserRole.VIEWER);
        when(repository.findById(7L)).thenReturn(Optional.of(user));

        service.resetPassword(7L, new ResetPasswordRequest("replacement-password"));

        assertThat(passwordEncoder.matches("replacement-password", user.getPasswordHash())).isTrue();
        assertThat(user.getPasswordHash()).doesNotContain("replacement-password");
    }

    @Test
    void rejectsAUserSortPropertyThatCouldExposeInternalFields() {
        var pageable = PageRequest.of(0, 20, Sort.by("passwordHash"));

        assertThatThrownBy(() -> service.list(pageable))
                .isInstanceOf(InvalidUserSortException.class);
    }
}
