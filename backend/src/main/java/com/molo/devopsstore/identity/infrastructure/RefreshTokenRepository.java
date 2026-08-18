package com.molo.devopsstore.identity.infrastructure;

import com.molo.devopsstore.identity.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
}
