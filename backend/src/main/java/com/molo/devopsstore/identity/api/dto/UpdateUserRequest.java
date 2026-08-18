package com.molo.devopsstore.identity.api.dto;

import com.molo.devopsstore.identity.domain.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateUserRequest(
        @NotBlank @Size(max = 120) String displayName,
        @NotNull UserRole role) {
}
