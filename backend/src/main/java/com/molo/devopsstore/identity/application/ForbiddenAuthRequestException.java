package com.molo.devopsstore.identity.application;

public class ForbiddenAuthRequestException extends RuntimeException {

    public ForbiddenAuthRequestException() {
        super("Authentication request is not allowed");
    }
}
