FROM node:26.8-alpine3.24@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.5-alpine3.24@sha256:2ddec616f1cb58bcac057aa388f28cb81e35137641ef4226d321714499329bd1 AS runtime

USER root

RUN apk upgrade --no-cache libcrypto3 libssl3 libexpat libuuid

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html

USER 101:101

EXPOSE 8080
