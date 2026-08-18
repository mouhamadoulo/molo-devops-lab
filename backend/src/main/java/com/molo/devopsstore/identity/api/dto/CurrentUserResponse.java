package com.molo.devopsstore.identity.api.dto;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;

public record CurrentUserResponse(
        Long id,
        String email,
        String displayName,
        UserRole role) {

    public static CurrentUserResponse from(AppUser user) {
        return new CurrentUserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole());
    }
}
