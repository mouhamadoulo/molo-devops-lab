package com.molo.devopsstore.identity.application;

import com.molo.devopsstore.identity.domain.AppUser;
import java.time.Clock;
import java.util.Objects;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

@Service
public class AccessTokenService {

    private final JwtEncoder jwtEncoder;
    private final JwtProperties properties;
    private final Clock clock;

    public AccessTokenService(
            JwtEncoder jwtEncoder,
            JwtProperties properties,
            Clock clock) {
        this.jwtEncoder = jwtEncoder;
        this.properties = properties;
        this.clock = clock;
    }

    public String issue(AppUser user) {
        Objects.requireNonNull(user, "user must not be null");
        var issuedAt = clock.instant();
        var claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(user.getEmail())
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plus(properties.accessTokenTtl()))
                .claim("role", user.getRole().name())
                .build();
        var headers = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(headers, claims)).getTokenValue();
    }
}
