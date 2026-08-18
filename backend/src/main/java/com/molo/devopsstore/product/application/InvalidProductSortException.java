package com.molo.devopsstore.product.application;

public class InvalidProductSortException extends RuntimeException {

    public InvalidProductSortException(String property) {
        super("Unsupported product sort property: " + property);
    }
}
