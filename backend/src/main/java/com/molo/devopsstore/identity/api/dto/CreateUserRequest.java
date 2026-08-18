package com.molo.devopsstore.identity.api.dto;

import com.molo.devopsstore.identity.domain.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(max = 120) String displayName,
        @NotBlank @Size(min = 12, max = 128) String password,
        @NotNull UserRole role) {
}
