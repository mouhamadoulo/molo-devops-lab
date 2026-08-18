package com.molo.devopsstore.identity.application;

import com.molo.devopsstore.identity.api.dto.CreateUserRequest;
import com.molo.devopsstore.identity.api.dto.ResetPasswordRequest;
import com.molo.devopsstore.identity.api.dto.UpdateUserRequest;
import com.molo.devopsstore.identity.api.dto.UserResponse;
import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import com.molo.devopsstore.product.api.dto.PageResponse;
import java.util.Locale;
import java.util.Set;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAdminService {

    private static final Set<String> ALLOWED_SORT_PROPERTIES = Set.of(
            "email", "displayName", "role", "enabled", "createdAt", "updatedAt");

    private final AppUserRepository repository;
    private final PasswordEncoder passwordEncoder;

    public UserAdminService(AppUserRepository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> list(Pageable pageable) {
        pageable.getSort().forEach(order -> {
            if (!ALLOWED_SORT_PROPERTIES.contains(order.getProperty())) {
                throw new InvalidUserSortException(order.getProperty());
            }
        });
        return PageResponse.from(repository.findAll(pageable).map(UserResponse::from));
    }

    @Transactional
    public UserResponse create(CreateUserRequest request) {
        var email = normalizeEmail(request.email());
        if (repository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateUserEmailException();
        }
        return UserResponse.from(repository.save(AppUser.create(
                email,
                request.displayName(),
                passwordEncoder.encode(request.password()),
                request.role())));
    }

    @Transactional
    public UserResponse update(long id, UpdateUserRequest request) {
        var user = findUser(id);
        if (user.isEnabled()
                && user.getRole() == UserRole.ADMIN
                && request.role() != UserRole.ADMIN
                && repository.countByRoleAndEnabledTrue(UserRole.ADMIN) <= 1) {
            throw new InvalidUserOperationException("Cannot demote the last active administrator");
        }
        user.rename(request.displayName());
        user.changeRole(request.role());
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse setEnabled(long id, boolean enabled, String currentEmail) {
        var user = findUser(id);
        if (!enabled && user.getEmail().equalsIgnoreCase(currentEmail)) {
            throw new InvalidUserOperationException("Cannot disable the current account");
        }
        if (!enabled
                && user.isEnabled()
                && user.getRole() == UserRole.ADMIN
                && repository.countByRoleAndEnabledTrue(UserRole.ADMIN) <= 1) {
            throw new InvalidUserOperationException("Cannot disable the last active administrator");
        }
        if (enabled) {
            user.enable();
        } else {
            user.disable();
        }
        return UserResponse.from(user);
    }

    @Transactional
    public void resetPassword(long id, ResetPasswordRequest request) {
        findUser(id).changePasswordHash(passwordEncoder.encode(request.password()));
    }

    private AppUser findUser(long id) {
        return repository.findById(id).orElseThrow(() -> new UserNotFoundException(id));
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
