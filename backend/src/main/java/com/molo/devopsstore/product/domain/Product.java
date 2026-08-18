package com.molo.devopsstore.product.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 2_000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ProductCategory category;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    @Column(nullable = false)
    private boolean available;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Product() {
    }

    private Product(
            String name,
            String description,
            ProductCategory category,
            BigDecimal price,
            int stockQuantity,
            boolean available) {
        var now = Instant.now();
        this.name = name.trim();
        this.description = description == null ? "" : description.trim();
        this.category = category;
        this.price = price;
        this.stockQuantity = stockQuantity;
        this.available = available;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static Product create(
            String name,
            String description,
            ProductCategory category,
            BigDecimal price,
            int stockQuantity,
            boolean available) {
        return new Product(name, description, category, price, stockQuantity, available);
    }

    public void update(
            String name,
            String description,
            ProductCategory category,
            BigDecimal price,
            int stockQuantity,
            boolean available) {
        this.name = name.trim();
        this.description = description == null ? "" : description.trim();
        this.category = category;
        this.price = price;
        this.stockQuantity = stockQuantity;
        this.available = available;
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public ProductCategory getCategory() {
        return category;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public int getStockQuantity() {
        return stockQuantity;
    }

    public boolean isAvailable() {
        return available;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
