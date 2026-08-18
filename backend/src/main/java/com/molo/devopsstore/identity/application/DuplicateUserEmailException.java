package com.molo.devopsstore.identity.application;

public class DuplicateUserEmailException extends RuntimeException {

    public DuplicateUserEmailException() {
        super("A user already exists with this email");
    }
}
