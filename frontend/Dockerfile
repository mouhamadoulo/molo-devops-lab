FROM node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24@sha256:378d0c32f6562f7fd9629170797f57d2b953aa09be983b3daaf4809bb039ca00 AS runtime

USER root

RUN apk upgrade --no-cache libcrypto3 libssl3 libexpat libuuid

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html

USER 101:101

EXPOSE 8080
