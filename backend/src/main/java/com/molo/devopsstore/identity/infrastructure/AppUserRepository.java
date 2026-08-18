package com.molo.devopsstore.identity.infrastructure;

import com.molo.devopsstore.identity.domain.AppUser;
import com.molo.devopsstore.identity.domain.UserRole;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    long countByRoleAndEnabledTrue(UserRole role);

    boolean existsByRoleAndEnabledTrue(UserRole role);
}
