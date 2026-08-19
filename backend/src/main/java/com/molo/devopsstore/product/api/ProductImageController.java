package com.molo.devopsstore.product.api;

import com.molo.devopsstore.product.api.dto.ProductImageResponse;
import com.molo.devopsstore.product.api.dto.ReorderProductImagesRequest;
import com.molo.devopsstore.product.application.InvalidImageException;
import com.molo.devopsstore.product.application.ProductImageService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/products/{productId}/images")
public class ProductImageController {

    private final ProductImageService imageService;

    public ProductImageController(ProductImageService imageService) {
        this.imageService = imageService;
    }

    @GetMapping
    public List<ProductImageResponse> list(@PathVariable long productId) {
        return imageService.list(productId);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ProductImageResponse> upload(
            @PathVariable long productId,
            @RequestPart("file") MultipartFile file) {
        try (var content = file.getInputStream()) {
            var response = imageService.upload(productId, content, file.getContentType());
            var location = URI.create(
                    "/api/v1/products/" + productId + "/images/" + response.id());
            return ResponseEntity.created(location).body(response);
        } catch (IOException exception) {
            throw new InvalidImageException("Image content could not be read", exception);
        }
    }

    @PutMapping("/order")
    public List<ProductImageResponse> reorder(
            @PathVariable long productId,
            @Valid @RequestBody ReorderProductImagesRequest request) {
        return imageService.reorder(productId, request.imageIds());
    }

    @PutMapping("/{imageId}/primary")
    public ProductImageResponse makePrimary(
            @PathVariable long productId,
            @PathVariable long imageId) {
        return imageService.makePrimary(productId, imageId);
    }

    @DeleteMapping("/{imageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable long productId,
            @PathVariable long imageId) {
        imageService.delete(productId, imageId);
    }
}
