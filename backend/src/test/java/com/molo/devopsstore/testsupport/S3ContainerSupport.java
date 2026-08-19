package com.molo.devopsstore.testsupport;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

public final class S3ContainerSupport {

    public static final String ACCESS_KEY = "devops_store_test";
    public static final String SECRET_KEY = "devops-store-test-secret";
    public static final String BUCKET = "product-images-test";

    private static final String IMAGE = "quay.io/minio/aistor/minio:RELEASE.2026-04-14T21-32-45Z"
            + "@sha256:3fe2c9acc9bf79ce982fa61d4befb97556a34e44e278395152ed54de471bb95d";
    private static final String CONTAINER_LICENSE_PATH = "/run/secrets/minio.license";

    private S3ContainerSupport() {
    }

    public static GenericContainer<?> container() {
        var licensePath = requireLicensePath();

        return new GenericContainer<>(DockerImageName.parse(IMAGE))
                .withEnv("HOME", "/tmp")
                .withEnv("MINIO_ROOT_USER", ACCESS_KEY)
                .withEnv("MINIO_ROOT_PASSWORD", SECRET_KEY)
                .withCopyFileToContainer(
                        MountableFile.forHostPath(licensePath, 0444),
                        CONTAINER_LICENSE_PATH)
                .withTmpFs(Map.of("/mnt/data", "rw,mode=1777"))
                .withCreateContainerCmdModifier(command -> command.withUser("1000:1000"))
                .withCommand(
                        "minio", "server", "/mnt/data",
                        "--console-address", ":9001",
                        "--license", CONTAINER_LICENSE_PATH)
                .withExposedPorts(9000)
                .waitingFor(Wait.forHttp("/minio/health/live").forPort(9000));
    }

    private static Path requireLicensePath() {
        var configuredPath = System.getenv("MINIO_LICENSE_FILE");
        if (configuredPath == null || configuredPath.isBlank()) {
            throw new IllegalStateException(
                    "MINIO_LICENSE_FILE must point to a local AIStor license for S3 integration tests");
        }

        var licensePath = Path.of(configuredPath).toAbsolutePath().normalize();
        if (!Files.isRegularFile(licensePath) || !Files.isReadable(licensePath)) {
            throw new IllegalStateException(
                    "MINIO_LICENSE_FILE does not point to a readable regular file: " + licensePath);
        }
        return licensePath;
    }
}
