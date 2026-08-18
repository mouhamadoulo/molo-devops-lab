package com.molo.devopsstore.product.infrastructure;

import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class ProductSpecifications {

    private ProductSpecifications() {
    }

    public static Specification<Product> matching(
            String search,
            ProductCategory category,
            Boolean available) {
        var specification = Specification.<Product>unrestricted();

        if (search != null && !search.isBlank()) {
            var pattern = "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
            specification = specification.and(
                    (root, query, criteriaBuilder) -> criteriaBuilder.like(
                            criteriaBuilder.lower(root.get("name")), pattern));
        }
        if (category != null) {
            specification = specification.and(
                    (root, query, criteriaBuilder) -> criteriaBuilder.equal(root.get("category"), category));
        }
        if (available != null) {
            specification = specification.and(
                    (root, query, criteriaBuilder) -> criteriaBuilder.equal(root.get("available"), available));
        }

        return specification;
    }
}
