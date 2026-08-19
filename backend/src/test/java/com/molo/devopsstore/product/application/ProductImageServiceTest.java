package com.molo.devopsstore.product.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.molo.devopsstore.product.domain.Product;
import com.molo.devopsstore.product.domain.ProductCategory;
import com.molo.devopsstore.product.domain.ProductImage;
import com.molo.devopsstore.product.infrastructure.ProductImageRepository;
import com.molo.devopsstore.product.infrastructure.ProductRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class ProductImageServiceTest {

    private static final long PRODUCT_ID = 42L;
    private static final int MAX_SIZE_BYTES = 5 * 1024 * 1024;
    private static final byte[] VALID_WEBP = Base64.getDecoder().decode(
            "UklGRlYAAABXRUJQVlA4IDoAAADwAgCdASoBAAEAAEcIhYWIhYSIAgICdaoD"
                    + "+AP6Ag1NGAD+/vNYf/5gZt2KO//mBv/80F4SW6//zLwASUNNVAgAAAB0ZXN0"
                    + "MXgxAA==");

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductImageRepository imageRepository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    private ImageInspector imageInspector;
    private ProductImageService service;
    private Product product;

    @BeforeEach
    void setUp() {
        imageInspector = new ImageInspector();
        service = new ProductImageService(
                productRepository,
                imageRepository,
                objectStorage,
                imageInspector,
                new ProductImageMapper(objectStorage),
                eventPublisher);
        product = Product.create(
                "Camera", "Test product", ProductCategory.OTHER,
                new BigDecimal("199.00"), 2, true);
    }

    @Test
    void acceptsJpegPngAndWebpFromTheirRealContent() throws Exception {
        var jpeg = image("jpeg", 3, 2);
        var png = image("png", 4, 3);

        assertThat(imageInspector.inspect(new ByteArrayInputStream(jpeg), "image/jpeg"))
                .satisfies(info -> {
                    assertThat(info.contentType()).isEqualTo("image/jpeg");
                    assertThat(info.width()).isEqualTo(3);
                    assertThat(info.height()).isEqualTo(2);
                });
        assertThat(imageInspector.inspect(new ByteArrayInputStream(png), "image/png"))
                .satisfies(info -> {
                    assertThat(info.contentType()).isEqualTo("image/png");
                    assertThat(info.width()).isEqualTo(4);
                    assertThat(info.height()).isEqualTo(3);
                });
        assertThat(imageInspector.inspect(new ByteArrayInputStream(VALID_WEBP), "image/webp"))
                .satisfies(info -> {
                    assertThat(info.contentType()).isEqualTo("image/webp");
                    assertThat(info.width()).isEqualTo(1);
                    assertThat(info.height()).isEqualTo(1);
                });
    }

    @Test
    void rejectsTruncatedImagesAndMismatchedContentTypes() throws Exception {
        var jpeg = image("jpeg", 3, 2);
        var png = image("png", 3, 2);

        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(java.util.Arrays.copyOf(jpeg, 12)), "image/jpeg"))
                .isInstanceOf(InvalidImageException.class);
        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(png), "image/jpeg"))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("content type");
    }

    @Test
    void rejectsSvgAndAnimatedFormats() throws Exception {
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
                .getBytes(StandardCharsets.UTF_8);
        var apng = apngWithAnimationControl(image("png", 2, 2));

        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(svg), "image/svg+xml"))
                .isInstanceOf(InvalidImageException.class);
        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(animatedWebpHeader()), "image/webp"))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("Animated");
        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(apng), "image/png"))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("Animated PNG");
    }

    @Test
    void rejectsFilesOverFiveMebibytesAndDimensionsOver4096() throws Exception {
        var tooLarge = new byte[MAX_SIZE_BYTES + 1];
        var tooWide = image("png", 4097, 1);

        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(tooLarge), "image/png"))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("5 MiB");
        assertThatThrownBy(() -> imageInspector.inspect(
                new ByteArrayInputStream(tooWide), "image/png"))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("4096");
    }

    @Test
    void uploadsTheFirstImageAsPrimaryAtPositionZero() throws Exception {
        var png = image("png", 4, 3);
        prepareGallery(List.of());
        when(objectStorage.put(anyString(), any(), anyLong(), anyString()))
                .thenAnswer(invocation -> new StoredObject(invocation.getArgument(0), "etag"));
        when(imageRepository.saveAndFlush(any(ProductImage.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.upload(
                PRODUCT_ID,
                new ByteArrayInputStream(png),
                "image/png");

        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.width()).isEqualTo(4);
        assertThat(response.height()).isEqualTo(3);
        assertThat(response.position()).isZero();
        assertThat(response.primary()).isTrue();

        var imageCaptor = ArgumentCaptor.forClass(ProductImage.class);
        verify(imageRepository).saveAndFlush(imageCaptor.capture());
        assertThat(imageCaptor.getValue().getObjectKey())
                .matches("products/42/[0-9a-f-]{36}");
    }

    @Test
    void rejectsASixthImageBeforeWritingToObjectStorage() throws Exception {
        var png = image("png", 1, 1);
        prepareGallery(List.of(
                storedImage(0), storedImage(1), storedImage(2), storedImage(3), storedImage(4)));

        assertThatThrownBy(() -> service.upload(
                PRODUCT_ID,
                new ByteArrayInputStream(png),
                "image/png"))
                .isInstanceOf(ImageLimitExceededException.class);

        verify(objectStorage, never()).put(anyString(), any(), anyLong(), anyString());
    }

    @Test
    void deletesTheObjectWhenMetadataPersistenceFails() throws Exception {
        var png = image("png", 2, 2);
        prepareGallery(List.of());
        when(objectStorage.put(anyString(), any(), anyLong(), anyString()))
                .thenAnswer(invocation -> new StoredObject(invocation.getArgument(0), "etag"));
        when(imageRepository.saveAndFlush(any(ProductImage.class)))
                .thenThrow(new DataIntegrityViolationException("database rejected metadata"));

        assertThatThrownBy(() -> service.upload(
                PRODUCT_ID,
                new ByteArrayInputStream(png),
                "image/png"))
                .isInstanceOf(DataIntegrityViolationException.class);

        var objectKey = ArgumentCaptor.forClass(String.class);
        verify(objectStorage).delete(objectKey.capture());
        assertThat(objectKey.getValue()).matches("products/42/[0-9a-f-]{36}");
    }

    @Test
    void deletesTheUploadedObjectWhenTheTransactionRollsBackAtCommit() throws Exception {
        var png = image("png", 2, 2);
        prepareGallery(List.of());
        when(objectStorage.put(anyString(), any(), anyLong(), anyString()))
                .thenAnswer(invocation -> new StoredObject(invocation.getArgument(0), "etag"));
        when(imageRepository.saveAndFlush(any(ProductImage.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.upload(PRODUCT_ID, new ByteArrayInputStream(png), "image/png");
            verify(objectStorage, never()).delete(anyString());
            var synchronizations = TransactionSynchronizationManager.getSynchronizations();
            assertThat(synchronizations).isNotEmpty();

            synchronizations.forEach(synchronization -> synchronization.afterCompletion(
                    TransactionSynchronization.STATUS_ROLLED_BACK));

            var objectKey = ArgumentCaptor.forClass(String.class);
            verify(objectStorage).delete(objectKey.capture());
            assertThat(objectKey.getValue()).matches("products/42/[0-9a-f-]{36}");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }

    @Test
    void requestsObjectDeletionAfterRemovingImageMetadata() {
        var image = mock(ProductImage.class);
        when(image.getId()).thenReturn(7L);
        when(image.getObjectKey()).thenReturn("products/42/deleted-object");
        when(productRepository.findByIdForUpdate(PRODUCT_ID)).thenReturn(Optional.of(product));
        when(imageRepository.findByProductIdForUpdate(PRODUCT_ID)).thenReturn(List.of(image));

        service.delete(PRODUCT_ID, 7L);

        verify(eventPublisher).publishEvent(
                new ObjectDeletionRequested("products/42/deleted-object"));
        verify(objectStorage, never()).delete("products/42/deleted-object");
    }

    private void prepareGallery(List<ProductImage> images) {
        when(productRepository.findByIdForUpdate(PRODUCT_ID)).thenReturn(Optional.of(product));
        when(imageRepository.findByProductIdForUpdate(PRODUCT_ID)).thenReturn(images);
    }

    private ProductImage storedImage(int position) {
        return ProductImage.create(
                product,
                "products/42/existing-" + position,
                "image/png",
                100,
                1,
                1,
                position,
                position == 0);
    }

    private byte[] image(String format, int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, output)).isTrue();
        return output.toByteArray();
    }

    private byte[] animatedWebpHeader() {
        var bytes = ByteBuffer.allocate(30).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put("RIFF".getBytes(StandardCharsets.US_ASCII));
        bytes.putInt(22);
        bytes.put("WEBP".getBytes(StandardCharsets.US_ASCII));
        bytes.put("VP8X".getBytes(StandardCharsets.US_ASCII));
        bytes.putInt(10);
        bytes.put((byte) 0x02);
        bytes.put(new byte[9]);
        return bytes.array();
    }

    private byte[] apngWithAnimationControl(byte[] png) throws Exception {
        var output = new ByteArrayOutputStream();
        output.write(png, 0, 33);
        var chunkData = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN)
                .putInt(2)
                .putInt(0)
                .array();
        var chunkType = "acTL".getBytes(StandardCharsets.US_ASCII);
        var crc = new CRC32();
        crc.update(chunkType);
        crc.update(chunkData);
        var data = new DataOutputStream(output);
        data.writeInt(chunkData.length);
        data.write(chunkType);
        data.write(chunkData);
        data.writeInt((int) crc.getValue());
        data.write(png, 33, png.length - 33);
        return output.toByteArray();
    }
}
