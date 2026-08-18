package com.molo.devopsstore.identity.api.dto;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import java.time.Instant;

public record UserResponse(
        Long id,
        String email,
        String displayName,
        UserRole role,
        boolean enabled,
        Instant createdAt,
        Instant updatedAt) {

    public static UserResponse from(AppUser user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.isEnabled(),
                user.getCreatedAt(),
                user.getUpdatedAt());
    }
}
