package com.molo.devopsstore.identity.application;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.RefreshToken;
import com.molo.devopsstore.identity.infrastructure.RefreshTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {

    private static final int TOKEN_BYTES = 32;

    private final RefreshTokenRepository repository;
    private final Clock clock;
    private final SecureRandom secureRandom;
    private final AuthProperties properties;

    public RefreshTokenService(
            RefreshTokenRepository repository,
            Clock clock,
            SecureRandom secureRandom,
            AuthProperties properties) {
        this.repository = repository;
        this.clock = clock;
        this.secureRandom = secureRandom;
        this.properties = properties;
    }

    @Transactional
    public RefreshSession issue(AppUser user) {
        return issuePersisted(user, UUID.randomUUID()).session();
    }

    @Transactional(noRollbackFor = InvalidSessionException.class)
    public RefreshSession rotate(String rawToken) {
        var now = clock.instant();
        var previous = repository.findByTokenHashForUpdate(hash(rawToken))
                .orElseThrow(InvalidSessionException::new);
        if (previous.getConsumedAt() != null || previous.getRevokedAt() != null) {
            repository.revokeFamily(previous.getFamilyId(), now);
            throw new InvalidSessionException();
        }
        if (!previous.getExpiresAt().isAfter(now) || !previous.getUser().isEnabled()) {
            repository.revokeFamily(previous.getFamilyId(), now);
            throw new InvalidSessionException();
        }
        var replacement = issuePersisted(previous.getUser(), previous.getFamilyId());
        previous.consume(now, replacement.persisted().getId());
        return replacement.session();
    }

    @Transactional
    public void revoke(String rawToken) {
        repository.findByTokenHashForUpdate(hash(rawToken))
                .ifPresent(token -> repository.revokeFamily(token.getFamilyId(), clock.instant()));
    }

    private IssuedRefreshSession issuePersisted(AppUser user, UUID familyId) {
        var rawToken = randomToken();
        var now = clock.instant();
        var persisted = repository.saveAndFlush(RefreshToken.issue(
                user,
                hash(rawToken),
                familyId,
                now.plus(properties.refreshTokenTtl()),
                now));
        return new IssuedRefreshSession(
                new RefreshSession(rawToken, user, persisted.getExpiresAt()),
                persisted);
    }

    private String randomToken() {
        var bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String value) {
        if (value == null || value.isBlank()) {
            throw new InvalidSessionException();
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record RefreshSession(
            String token,
            AppUser user,
            Instant expiresAt) {
    }

    private record IssuedRefreshSession(
            RefreshSession session,
            RefreshToken persisted) {
    }
}
