package com.molo.devopsstore.identity.application;

public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(long id) {
        super("User " + id + " was not found");
    }
}
