package com.molo.devopsstore.identity.application;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.infrastructure.AppUserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenService accessTokenService;
    private final RefreshTokenService refreshTokenService;

    public AuthService(
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder,
            AccessTokenService accessTokenService,
            RefreshTokenService refreshTokenService) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.accessTokenService = accessTokenService;
        this.refreshTokenService = refreshTokenService;
    }

    public AuthSession login(String email, String password) {
        var user = appUserRepository.findByEmailIgnoreCase(email)
                .filter(AppUser::isEnabled)
                .filter(candidate -> passwordEncoder.matches(password, candidate.getPasswordHash()))
                .orElseThrow(InvalidCredentialsException::new);
        return session(user, refreshTokenService.issue(user));
    }

    public AuthSession refresh(String refreshToken) {
        var rotated = refreshTokenService.rotate(refreshToken);
        return session(rotated.user(), rotated);
    }

    public void logout(String refreshToken) {
        refreshTokenService.revoke(refreshToken);
    }

    public AppUser currentUser(String email) {
        return appUserRepository.findByEmailIgnoreCase(email)
                .filter(AppUser::isEnabled)
                .orElseThrow(InvalidSessionException::new);
    }

    private AuthSession session(
            AppUser user,
            RefreshTokenService.RefreshSession refreshSession) {
        return new AuthSession(
                accessTokenService.issue(user),
                refreshSession.token(),
                refreshSession.expiresAt(),
                user);
    }

    public record AuthSession(
            String accessToken,
            String refreshToken,
            java.time.Instant refreshExpiresAt,
            AppUser user) {
    }
}
