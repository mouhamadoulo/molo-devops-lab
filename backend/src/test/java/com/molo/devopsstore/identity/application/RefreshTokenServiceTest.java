package com.molo.devopsstore.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.RefreshToken;
import com.molo.devopsstore.identity.domain.UserRole;
import com.molo.devopsstore.identity.infrastructure.RefreshTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class RefreshTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-18T12:00:00Z");

    private RefreshTokenRepository repository;
    private RefreshTokenService service;
    private AppUser user;

    @BeforeEach
    void setUp() {
        repository = mock(RefreshTokenRepository.class);
        var random = mock(SecureRandom.class);
        doAnswer(invocation -> {
            var bytes = invocation.getArgument(0, byte[].class);
            java.util.Arrays.fill(bytes, (byte) 7);
            return null;
        }).when(random).nextBytes(any(byte[].class));
        service = new RefreshTokenService(
                repository,
                Clock.fixed(NOW, ZoneOffset.UTC),
                random,
                new AuthProperties(Duration.ofDays(7), false));
        user = AppUser.create(
                "admin@example.com", "Admin", "bcrypt-hash", UserRole.ADMIN);
        when(repository.saveAndFlush(any(RefreshToken.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void issuesASevenDayRandomTokenWhilePersistingOnlyItsSha256Hash() {
        var session = service.issue(user);

        var captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).saveAndFlush(captor.capture());
        var stored = captor.getValue();
        assertThat(session.token()).hasSize(43);
        assertThat(stored.getTokenHash()).isEqualTo(sha256(session.token()));
        assertThat(stored.getTokenHash()).doesNotContain(session.token());
        assertThat(stored.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofDays(7)));
        assertThat(session.user()).isSameAs(user);
    }

    @Test
    void rotatesOnceWithinTheSameFamilyAndConsumesThePreviousToken() {
        var rawToken = "previous-refresh-token";
        var familyId = UUID.randomUUID();
        var previous = RefreshToken.issue(
                user,
                sha256(rawToken),
                familyId,
                NOW.plus(Duration.ofDays(1)),
                NOW.minusSeconds(60));
        when(repository.findByTokenHashForUpdate(sha256(rawToken)))
                .thenReturn(Optional.of(previous));

        var rotated = service.rotate(rawToken);

        assertThat(rotated.token()).isNotEqualTo(rawToken);
        assertThat(previous.getConsumedAt()).isEqualTo(NOW);
        assertThat(previous.getLastUsedAt()).isEqualTo(NOW);
        var captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getFamilyId()).isEqualTo(familyId);
    }

    @Test
    void revokesTheWholeFamilyWhenAConsumedTokenIsReused() {
        var rawToken = "already-consumed-refresh-token";
        var familyId = UUID.randomUUID();
        var previous = RefreshToken.issue(
                user,
                sha256(rawToken),
                familyId,
                NOW.plus(Duration.ofDays(1)),
                NOW.minusSeconds(60));
        previous.consume(NOW.minusSeconds(1), null);
        when(repository.findByTokenHashForUpdate(sha256(rawToken)))
                .thenReturn(Optional.of(previous));

        assertThatThrownBy(() -> service.rotate(rawToken))
                .isInstanceOf(InvalidSessionException.class);

        verify(repository).revokeFamily(familyId, NOW);
    }

    @Test
    void rejectsAndRevokesExpiredOrDisabledSessions() {
        var expiredRaw = "expired-refresh-token";
        var expiredFamily = UUID.randomUUID();
        var expired = RefreshToken.issue(
                user,
                sha256(expiredRaw),
                expiredFamily,
                NOW.minusSeconds(1),
                NOW.minus(Duration.ofDays(8)));
        when(repository.findByTokenHashForUpdate(sha256(expiredRaw)))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.rotate(expiredRaw))
                .isInstanceOf(InvalidSessionException.class);
        verify(repository).revokeFamily(expiredFamily, NOW);

        user.disable();
        var disabledRaw = "disabled-user-refresh-token";
        var disabledFamily = UUID.randomUUID();
        var disabled = RefreshToken.issue(
                user,
                sha256(disabledRaw),
                disabledFamily,
                NOW.plus(Duration.ofDays(1)),
                NOW.minusSeconds(60));
        when(repository.findByTokenHashForUpdate(sha256(disabledRaw)))
                .thenReturn(Optional.of(disabled));

        assertThatThrownBy(() -> service.rotate(disabledRaw))
                .isInstanceOf(InvalidSessionException.class);
        verify(repository).revokeFamily(disabledFamily, NOW);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
