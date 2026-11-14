FROM maven:3.9.16-eclipse-temurin-25@sha256:31618505df21177d2baa3dc574be2d0b0b32614c8539baca1f23a9136b766eb0 AS build

WORKDIR /workspace

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests package \
    && cp target/devops-store-backend-0.1.0-SNAPSHOT.jar application.jar

FROM eclipse-temurin:25-jre-alpine@sha256:e1898fd6a11fc965a994d8ace186fd3585aeb636cf8f05f47a723fcfee0b0918 AS runtime

RUN apk upgrade --no-cache libcrypto3 libssl3 openssl libexpat

RUN addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

WORKDIR /app

COPY --from=build --chown=10001:10001 /workspace/application.jar application.jar

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/application.jar"]
