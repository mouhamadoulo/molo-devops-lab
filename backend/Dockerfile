FROM maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2 AS build

WORKDIR /workspace

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests package \
    && cp target/devops-store-backend-0.1.0-SNAPSHOT.jar application.jar

FROM eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682 AS runtime

RUN apk upgrade --no-cache libcrypto3 libssl3 openssl

RUN addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

WORKDIR /app

COPY --from=build --chown=10001:10001 /workspace/application.jar application.jar

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/application.jar"]
