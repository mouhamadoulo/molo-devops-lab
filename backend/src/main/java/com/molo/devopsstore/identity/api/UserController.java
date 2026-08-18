package com.molo.devopsstore.identity.api;

import com.molo.devopsstore.identity.api.dto.CreateUserRequest;
import com.molo.devopsstore.identity.api.dto.ResetPasswordRequest;
import com.molo.devopsstore.identity.api.dto.UpdateUserRequest;
import com.molo.devopsstore.identity.api.dto.UserResponse;
import com.molo.devopsstore.identity.application.UserAdminService;
import com.molo.devopsstore.product.api.dto.PageResponse;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserAdminService service;

    public UserController(UserAdminService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<UserResponse> list(
            @PageableDefault(size = 20, sort = "email") Pageable pageable) {
        return service.list(pageable);
    }

    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        var response = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/users/" + response.id())).body(response);
    }

    @PutMapping("/{id}")
    public UserResponse update(
            @PathVariable long id,
            @Valid @RequestBody UpdateUserRequest request) {
        return service.update(id, request);
    }

    @PutMapping("/{id}/enabled")
    public UserResponse setEnabled(
            @PathVariable long id,
            @RequestParam boolean enabled,
            Authentication authentication) {
        return service.setEnabled(id, enabled, authentication.getName());
    }

    @PutMapping("/{id}/password")
    public ResponseEntity<Void> resetPassword(
            @PathVariable long id,
            @Valid @RequestBody ResetPasswordRequest request) {
        service.resetPassword(id, request);
        return ResponseEntity.noContent().build();
    }
}
