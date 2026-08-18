package com.molo.devopsstore.identity.api;

import com.molo.devopsstore.identity.api.dto.CurrentUserResponse;
import com.molo.devopsstore.identity.api.dto.LoginRequest;
import com.molo.devopsstore.identity.api.dto.SessionResponse;
import com.molo.devopsstore.identity.application.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthCookieService cookieService;

    public AuthController(AuthService authService, AuthCookieService cookieService) {
        this.authService = authService;
        this.cookieService = cookieService;
    }

    @PostMapping("/login")
    public SessionResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse response) {
        cookieService.validate(servletRequest, false);
        var session = authService.login(request.email(), request.password());
        cookieService.setSessionCookies(response, session.refreshToken());
        return SessionResponse.from(session);
    }

    @PostMapping("/refresh")
    public SessionResponse refresh(
            HttpServletRequest request,
            HttpServletResponse response) {
        cookieService.validate(request, true);
        var session = authService.refresh(cookieService.refreshToken(request));
        cookieService.setSessionCookies(response, session.refreshToken());
        return SessionResponse.from(session);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest request,
            HttpServletResponse response) {
        cookieService.validate(request, true);
        authService.logout(cookieService.refreshToken(request));
        cookieService.clearSessionCookies(response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public CurrentUserResponse me(Authentication authentication) {
        return CurrentUserResponse.from(authService.currentUser(authentication.getName()));
    }
}
