package com.molo.devopsstore.product.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ReorderProductImagesRequest(
        @NotNull @Size(max = 5) List<@Positive Long> imageIds) {
}
