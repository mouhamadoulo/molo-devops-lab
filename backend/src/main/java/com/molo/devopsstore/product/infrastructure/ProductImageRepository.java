package com.molo.devopsstore.product.infrastructure;

import com.molo.devopsstore.product.domain.ProductImage;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

    List<ProductImage> findByProductIdOrderByPosition(long productId);

    Optional<ProductImage> findByProductIdAndPrimaryTrue(long productId);

    List<ProductImage> findByProductIdInAndPrimaryTrue(Set<Long> productIds);

    @Query("select image.objectKey from ProductImage image")
    Set<String> findAllObjectKeys();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select image
            from ProductImage image
            where image.product.id = :productId
            order by image.position
            """)
    List<ProductImage> findByProductIdForUpdate(@Param("productId") long productId);
}
