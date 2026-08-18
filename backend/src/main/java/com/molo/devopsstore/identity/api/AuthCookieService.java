package com.molo.devopsstore.identity.api;

import com.molo.devopsstore.identity.application.AuthProperties;
import com.molo.devopsstore.identity.application.ForbiddenAuthRequestException;
import com.molo.devopsstore.identity.application.InvalidSessionException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AuthCookieService {

    public static final String REFRESH_COOKIE = "DEVOPS_REFRESH";
    public static final String XSRF_COOKIE = "XSRF-TOKEN";
    public static final String XSRF_HEADER = "X-XSRF-TOKEN";
    private static final String AUTH_PATH = "/api/v1/auth";

    private final AuthProperties properties;
    private final SecureRandom secureRandom;
    private final String allowedOrigin;

    public AuthCookieService(
            AuthProperties properties,
            SecureRandom secureRandom,
            @Value("${app.cors.allowed-origin:http://localhost:4200}") String allowedOrigin) {
        this.properties = properties;
        this.secureRandom = secureRandom;
        this.allowedOrigin = allowedOrigin;
    }

    public void validate(HttpServletRequest request, boolean requireXsrf) {
        if (!allowedOrigin.equals(request.getHeader(HttpHeaders.ORIGIN))) {
            throw new ForbiddenAuthRequestException();
        }
        if (requireXsrf) {
            var cookieToken = cookie(request, XSRF_COOKIE);
            var headerToken = request.getHeader(XSRF_HEADER);
            if (cookieToken == null || headerToken == null
                    || !MessageDigest.isEqual(
                            cookieToken.getBytes(StandardCharsets.UTF_8),
                            headerToken.getBytes(StandardCharsets.UTF_8))) {
                throw new ForbiddenAuthRequestException();
            }
        }
    }

    public String refreshToken(HttpServletRequest request) {
        var value = cookie(request, REFRESH_COOKIE);
        if (value == null || value.isBlank()) {
            throw new InvalidSessionException();
        }
        return value;
    }

    public void setSessionCookies(HttpServletResponse response, String refreshToken) {
        add(response, cookie(REFRESH_COOKIE, refreshToken, AUTH_PATH, true,
                properties.refreshTokenTtl()));
        add(response, cookie(XSRF_COOKIE, randomToken(), "/", false,
                properties.refreshTokenTtl()));
    }

    public void clearSessionCookies(HttpServletResponse response) {
        add(response, cookie(REFRESH_COOKIE, "", AUTH_PATH, true, Duration.ZERO));
        add(response, cookie(XSRF_COOKIE, "", "/", false, Duration.ZERO));
    }

    private ResponseCookie cookie(
            String name,
            String value,
            String path,
            boolean httpOnly,
            Duration maxAge) {
        return ResponseCookie.from(name, value)
                .httpOnly(httpOnly)
                .secure(properties.cookieSecure())
                .sameSite("Strict")
                .path(path)
                .maxAge(maxAge)
                .build();
    }

    private String randomToken() {
        var bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String cookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private static void add(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
