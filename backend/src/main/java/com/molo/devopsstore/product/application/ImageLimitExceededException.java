package com.molo.devopsstore.product.application;

public class ImageLimitExceededException extends RuntimeException {

    public ImageLimitExceededException(long productId) {
        super("Product " + productId + " already has five images");
    }
}
