package com.molo.devopsstore.product.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.molo.devopsstore.product.api.dto.PageResponse;
import com.molo.devopsstore.product.api.dto.ProductResponse;
import com.molo.devopsstore.product.application.InvalidProductSortException;
import com.molo.devopsstore.product.application.ProductNotFoundException;
import com.molo.devopsstore.product.application.ProductService;
import com.molo.devopsstore.product.domain.ProductCategory;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ProductControllerTest {

    @Mock
    private ProductService productService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ProductController(productService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver())
                .build();
    }

    @Test
    void createsAProduct() throws Exception {
        var now = Instant.parse("2026-08-18T10:00:00Z");
        when(productService.create(any())).thenReturn(new ProductResponse(
                42L,
                "MacBook Pro",
                "Portable professionnel",
                ProductCategory.LAPTOP,
                new BigDecimal("2499.90"),
                4,
                true,
                now,
                now,
                null));

        mockMvc.perform(post("/api/v1/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "MacBook Pro",
                                  "description": "Portable professionnel",
                                  "category": "LAPTOP",
                                  "price": 2499.90,
                                  "stockQuantity": 4,
                                  "available": true
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/products/42"))
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.name").value("MacBook Pro"));
    }

    @Test
    void listsFilteredProducts() throws Exception {
        var now = Instant.parse("2026-08-18T10:00:00Z");
        var product = new ProductResponse(
                1L, "MacBook Air", "Portable léger", ProductCategory.LAPTOP,
                new BigDecimal("1299.00"), 3, true, now, now, null);
        when(productService.list(eq("mac"), eq(ProductCategory.LAPTOP), eq(true), any(Pageable.class)))
                .thenReturn(new PageResponse<>(List.of(product), 0, 20, 1, 1, true));

        mockMvc.perform(get("/api/v1/products")
                        .param("search", "mac")
                        .param("category", "LAPTOP")
                        .param("available", "true")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "name,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].name").value("MacBook Air"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void returnsAProductById() throws Exception {
        var now = Instant.parse("2026-08-18T10:00:00Z");
        when(productService.getById(3L)).thenReturn(new ProductResponse(
                3L, "Écouteurs", "Audio sans fil", ProductCategory.AUDIO,
                new BigDecimal("99.90"), 7, true, now, now, null));

        mockMvc.perform(get("/api/v1/products/3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.category").value("AUDIO"));
    }

    @Test
    void updatesAProduct() throws Exception {
        var now = Instant.parse("2026-08-18T10:00:00Z");
        when(productService.update(eq(5L), any())).thenReturn(new ProductResponse(
                5L, "Dock USB-C", "Station d'accueil", ProductCategory.ACCESSORY,
                new BigDecimal("89.90"), 12, true, now, now, null));

        mockMvc.perform(put("/api/v1/products/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Dock USB-C",
                                  "description": "Station d'accueil",
                                  "category": "ACCESSORY",
                                  "price": 89.90,
                                  "stockQuantity": 12,
                                  "available": true
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Dock USB-C"));
    }

    @Test
    void deletesAProduct() throws Exception {
        mockMvc.perform(delete("/api/v1/products/8"))
                .andExpect(status().isNoContent());

        verify(productService).delete(8L);
    }

    @Test
    void returnsProblemDetailsWhenProductDoesNotExist() throws Exception {
        when(productService.getById(404L)).thenThrow(new ProductNotFoundException(404L));

        mockMvc.perform(get("/api/v1/products/404"))
                .andExpect(status().isNotFound())
                .andExpect(header().string("Content-Type", "application/problem+json"))
                .andExpect(jsonPath("$.title").value("Product not found"))
                .andExpect(jsonPath("$.detail").value("Product 404 not found"));
    }

    @Test
    void rejectsAnUnsupportedSortWithProblemDetails() throws Exception {
        when(productService.list(any(), any(), any(), any()))
                .thenThrow(new InvalidProductSortException("description"));

        mockMvc.perform(get("/api/v1/products").param("sort", "description,asc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid product sort"))
                .andExpect(jsonPath("$.detail")
                        .value("Unsupported product sort property: description"));
    }

    @Test
    void rejectsAnInvalidCreationRequest() throws Exception {
        mockMvc.perform(post("/api/v1/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": " ",
                                  "description": "Invalide",
                                  "category": "LAPTOP",
                                  "price": -1,
                                  "stockQuantity": -2,
                                  "available": true
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.price").exists())
                .andExpect(jsonPath("$.errors.stockQuantity").exists());

        verifyNoInteractions(productService);
    }
}
