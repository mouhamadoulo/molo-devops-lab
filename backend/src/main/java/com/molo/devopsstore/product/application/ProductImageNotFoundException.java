package com.molo.devopsstore.product.application;

public class ProductImageNotFoundException extends RuntimeException {

    public ProductImageNotFoundException(long productId, long imageId) {
        super("Image " + imageId + " was not found for product " + productId);
    }
}
