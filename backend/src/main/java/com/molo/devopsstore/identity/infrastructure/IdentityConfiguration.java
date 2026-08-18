package com.molo.devopsstore.identity.infrastructure;

import com.molo.devopsstore.identity.application.IdentityProperties;
import com.molo.devopsstore.identity.application.AuthProperties;
import java.security.SecureRandom;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableConfigurationProperties({IdentityProperties.class, AuthProperties.class})
public class IdentityConfiguration {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecureRandom secureRandom() {
        return new SecureRandom();
    }
}
