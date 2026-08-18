package com.molo.devopsstore.identity.api.dto;

import com.molo.devopsstore.identity.application.AuthService;

public record SessionResponse(
        String accessToken,
        CurrentUserResponse user) {

    public static SessionResponse from(AuthService.AuthSession session) {
        return new SessionResponse(
                session.accessToken(),
                CurrentUserResponse.from(session.user()));
    }
}
