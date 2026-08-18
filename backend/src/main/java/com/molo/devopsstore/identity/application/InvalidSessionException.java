package com.molo.devopsstore.identity.application;

public class InvalidSessionException extends RuntimeException {

    public InvalidSessionException() {
        super("Invalid session");
    }
}
