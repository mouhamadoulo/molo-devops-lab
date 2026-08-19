package com.molo.devopsstore.product.application;

public class InvalidImageOrderException extends RuntimeException {

    public InvalidImageOrderException(long productId) {
        super("Image order must contain exactly the existing image IDs for product " + productId);
    }
}
