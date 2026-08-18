package com.molo.devopsstore.identity.application;

public class InvalidUserOperationException extends RuntimeException {

    public InvalidUserOperationException(String message) {
        super(message);
    }
}
