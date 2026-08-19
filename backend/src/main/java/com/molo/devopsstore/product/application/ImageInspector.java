package com.molo.devopsstore.product.application;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import org.springframework.stereotype.Component;

@Component
public class ImageInspector {

    private static final int MAX_SIZE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DIMENSION = 4096;
    private static final int WEBP_ANIMATION_FLAG = 0x02;
    private static final Map<String, String> CONTENT_TYPES = Map.of(
            "jpeg", "image/jpeg",
            "jpg", "image/jpeg",
            "png", "image/png",
            "webp", "image/webp");

    public InspectedImage inspect(InputStream input, String declaredContentType) {
        if (input == null) {
            throw new InvalidImageException("Image content is required");
        }

        var content = readBounded(input);
        rejectAnimatedPng(content);
        rejectAnimatedWebp(content);

        try (var imageInput = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
            if (imageInput == null) {
                throw new InvalidImageException("Image content cannot be decoded");
            }

            var readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) {
                throw new InvalidImageException("Only JPEG, PNG and WebP images are allowed");
            }

            var reader = readers.next();
            try {
                return inspect(reader, imageInput, content, declaredContentType);
            } finally {
                reader.dispose();
            }
        } catch (InvalidImageException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw new InvalidImageException("Image content is invalid or truncated", exception);
        }
    }

    private InspectedImage inspect(
            ImageReader reader,
            javax.imageio.stream.ImageInputStream imageInput,
            byte[] content,
            String declaredContentType) throws IOException {
        reader.setInput(imageInput, false, true);
        var format = reader.getFormatName().toLowerCase(Locale.ROOT);
        var actualContentType = CONTENT_TYPES.get(format);
        if (actualContentType == null) {
            throw new InvalidImageException("Only JPEG, PNG and WebP images are allowed");
        }

        var normalizedDeclaredType = normalizeContentType(declaredContentType);
        if (!actualContentType.equals(normalizedDeclaredType)) {
            throw new InvalidImageException(
                    "Declared content type does not match the image content");
        }

        var width = reader.getWidth(0);
        var height = reader.getHeight(0);
        if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new InvalidImageException("Image dimensions must be between 1 and 4096 pixels");
        }

        if (reader.getNumImages(true) != 1) {
            throw new InvalidImageException("Animated images are not allowed");
        }
        if (reader.read(0) == null) {
            throw new InvalidImageException("Image content cannot be decoded");
        }

        return new InspectedImage(content, actualContentType, width, height);
    }

    private byte[] readBounded(InputStream input) {
        try {
            var content = input.readNBytes(MAX_SIZE_BYTES + 1);
            if (content.length > MAX_SIZE_BYTES) {
                throw new InvalidImageException("Image size must not exceed 5 MiB");
            }
            if (content.length == 0) {
                throw new InvalidImageException("Image content is empty");
            }
            return content;
        } catch (IOException exception) {
            throw new InvalidImageException("Image content could not be read", exception);
        }
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new InvalidImageException("Image content type is required");
        }
        var separator = contentType.indexOf(';');
        var mediaType = separator >= 0 ? contentType.substring(0, separator) : contentType;
        return mediaType.trim().toLowerCase(Locale.ROOT);
    }

    private void rejectAnimatedWebp(byte[] content) {
        if (!hasAscii(content, 0, "RIFF") || !hasAscii(content, 8, "WEBP")) {
            return;
        }

        var offset = 12;
        while (offset <= content.length - 8) {
            var chunkType = new String(content, offset, 4, StandardCharsets.US_ASCII);
            var chunkSize = littleEndianUnsignedInt(content, offset + 4);
            var dataOffset = offset + 8;
            if (chunkSize > content.length - dataOffset) {
                return;
            }
            if ("ANIM".equals(chunkType) || "ANMF".equals(chunkType)) {
                throw new InvalidImageException("Animated WebP images are not allowed");
            }
            if ("VP8X".equals(chunkType)
                    && chunkSize >= 1
                    && (content[dataOffset] & WEBP_ANIMATION_FLAG) != 0) {
                throw new InvalidImageException("Animated WebP images are not allowed");
            }

            var paddedSize = chunkSize + (chunkSize & 1L);
            if (paddedSize > Integer.MAX_VALUE || paddedSize > content.length - dataOffset) {
                return;
            }
            offset = dataOffset + (int) paddedSize;
        }
    }

    private void rejectAnimatedPng(byte[] content) {
        if (content.length < 8
                || (content[0] & 0xff) != 0x89
                || !hasAscii(content, 1, "PNG")
                || (content[4] & 0xff) != 0x0d
                || (content[5] & 0xff) != 0x0a
                || (content[6] & 0xff) != 0x1a
                || (content[7] & 0xff) != 0x0a) {
            return;
        }

        var offset = 8;
        while (offset <= content.length - 12) {
            var chunkSize = bigEndianUnsignedInt(content, offset);
            var typeOffset = offset + 4;
            var dataOffset = typeOffset + 4;
            if (chunkSize > content.length - dataOffset - 4L) {
                return;
            }
            if (hasAscii(content, typeOffset, "acTL")) {
                throw new InvalidImageException("Animated PNG images are not allowed");
            }
            offset = dataOffset + (int) chunkSize + 4;
        }
    }

    private boolean hasAscii(byte[] content, int offset, String expected) {
        if (offset < 0 || content.length - offset < expected.length()) {
            return false;
        }
        for (var index = 0; index < expected.length(); index++) {
            if (content[offset + index] != (byte) expected.charAt(index)) {
                return false;
            }
        }
        return true;
    }

    private long littleEndianUnsignedInt(byte[] content, int offset) {
        return (content[offset] & 0xffL)
                | ((content[offset + 1] & 0xffL) << 8)
                | ((content[offset + 2] & 0xffL) << 16)
                | ((content[offset + 3] & 0xffL) << 24);
    }

    private long bigEndianUnsignedInt(byte[] content, int offset) {
        return ((content[offset] & 0xffL) << 24)
                | ((content[offset + 1] & 0xffL) << 16)
                | ((content[offset + 2] & 0xffL) << 8)
                | (content[offset + 3] & 0xffL);
    }

    public record InspectedImage(
            byte[] content,
            String contentType,
            int width,
            int height) {

        public long sizeBytes() {
            return content.length;
        }
    }
}
