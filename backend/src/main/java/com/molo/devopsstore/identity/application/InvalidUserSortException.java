package com.molo.devopsstore.identity.application;

public class InvalidUserSortException extends RuntimeException {

    public InvalidUserSortException(String property) {
        super("Unsupported user sort property: " + property);
    }
}
