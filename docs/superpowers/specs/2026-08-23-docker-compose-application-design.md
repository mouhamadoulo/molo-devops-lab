# Docker and Compose Application Design

**Date:** 2026-08-23
**Status:** approved

## Objective

Package DevOps Store as two minimal application images and run the complete local application with
Docker Compose. A single command must start a healthy Angular frontend, Spring Boot backend,
PostgreSQL database and AIStor object store without embedding real secrets or build tools in the
runtime images.

## Scope

This increment creates the backend and frontend Dockerfiles, Nginx runtime configuration, build
contexts, Compose application services, environment example, Make targets and operational
documentation. It also separates AIStor's internal service endpoint from the public endpoint used
to sign browser-facing image URLs. It extends the existing PostgreSQL and AIStor Compose foundation
rather than replacing it.

CI workflows, remote registries, TLS termination, production orchestration and Kubernetes remain
outside this phase.

## Architecture

The backend image uses Maven 3.9.13 with JDK 25 to package the Spring Boot jar after the test stage
has been validated separately. This keeps Docker builds independent from the host Docker socket and
the AIStor test licence. A separate JRE 25 stage copies only the packaged application and runs it as
a dedicated non-root user.

The frontend image uses Node 24 and `npm ci` to build the Angular production bundle. A separate
unprivileged Nginx stage contains only the compiled static assets and Nginx configuration.

Compose manages five containers:

1. `postgres`, a durable PostgreSQL 18.4 service;
2. `object-storage-permissions`, a one-shot volume ownership initializer;
3. `object-storage`, the durable AIStor service;
4. `backend`, the Spring Boot API;
5. `frontend`, the Nginx entry point.

The four durable services must become healthy. The one-shot initializer must complete successfully.
Backend startup waits for PostgreSQL and AIStor health; frontend startup waits for backend health.

## Networking and request flow

All services share a private application network. Host bindings use `127.0.0.1` so the laboratory
is not exposed to the surrounding LAN. Local ports remain predictable: frontend 4200, backend 8080,
PostgreSQL 5432, AIStor API 9000 and AIStor console 9001.

The browser loads Angular from `http://localhost:4200`. Angular already calls `/api/v1`; Nginx
proxies `/api` to `backend:8080`. Authentication cookies and API requests therefore remain on one
browser origin and production Compose does not rely on CORS.

The backend uses `MINIO_ENDPOINT=http://object-storage:9000` for storage operations and
`MINIO_PUBLIC_ENDPOINT=http://localhost:9000` to sign URLs returned to the browser. Outside Compose,
the public endpoint defaults to the internal endpoint so existing local and integration-test
configuration remains compatible. Separate MinIO clients share the same credentials: the internal
client performs network operations and the public client only creates signatures for browser URLs.
`MINIO_REGION` defaults to AIStor's `us-east-1` and is passed explicitly to both clients, preventing
the signing client from attempting region discovery against the browser-facing endpoint.

Nginx generates or propagates `X-Request-ID`, forwards the standard proxy headers, serves
`index.html` for client-side routes and applies defensive content type, framing, referrer and
permissions headers. HTTP Strict Transport Security is intentionally excluded from the local HTTP
stack and belongs with future TLS termination.

## Security and configuration

Every external base image uses an immutable digest in addition to a readable version tag. Runtime
containers run as non-root, drop Linux capabilities where compatible and enable
`no-new-privileges`. Runtime stages contain neither Maven nor Node/npm and receive no build source.

Real credentials stay in the ignored `.env` file. `.env.example` lists required names but provides
no usable password, JWT secret, bootstrap password or AIStor secret. Compose uses required-variable
expressions so startup fails clearly when mandatory values or the AIStor licence are absent. The
licence remains a read-only bind mount and is never copied into an image.

Named volumes persist PostgreSQL and AIStor data. CPU and memory limits prevent a local service from
consuming the whole workstation. Services use bounded healthchecks, restart policies, stop signals
and grace periods compatible with Spring Boot graceful shutdown, PostgreSQL and Nginx.

## Build and operation interface

The root Makefile exposes self-documented targets: `help`, `application`, `build`, `test`,
`backend-test`, `frontend-test`, `up`, `down`, `status` and `logs`. Direct Docker Compose and native
Maven/npm commands remain documented for Windows users without GNU Make.

`application` builds and starts the stack. `build` builds the application images. `test` runs the
backend and frontend validation targets. Lifecycle targets remain thin wrappers over Compose and do
not hide destructive volume removal.

## Failure behaviour

- Missing secrets or licence stop Compose configuration/startup with an actionable message.
- PostgreSQL or AIStor health failure prevents backend startup.
- Backend health failure prevents frontend startup.
- Nginx returns an upstream error for an unavailable backend rather than silently serving fake API
  data.
- `docker compose down` preserves named data volumes; deleting volumes requires an explicit command
  outside the default Make targets.

## Verification strategy

Static validation first checks Compose rendering, pinned images, required healthchecks, local port
bindings, non-root users and the absence of versioned secrets. Image builds then verify that backend
and frontend runtime images start with numeric non-root users and do not expose Maven, Node or npm.

A backend test first proves that storage operations retain the internal endpoint while presigned
URLs use `MINIO_PUBLIC_ENDPOINT`, and that omitting the public value preserves the existing endpoint.

The integrated smoke test starts the stack with local validation-only credentials and the existing
AIStor licence, waits for all durable services to become healthy, then verifies:

- direct backend health on port 8080;
- Angular HTML and client-side route fallback on port 4200;
- API routing through Nginx on `/api`;
- Flyway migrations and sample products in PostgreSQL;
- persistence of PostgreSQL and AIStor data across a normal restart.

The final regression executes backend `clean verify`, frontend dependency installation, lint,
coverage tests, production build and Playwright, followed by `git diff --check`. Generated images,
reports, credentials and licences remain outside Git.

## Documentation and completion

The root README gains the complete local startup path. `docs/infrastructure/docker.md` records image stages,
networking, healthchecks, troubleshooting and the AIStor licence constraint. The implementation plan
is corrected to require four durable healthy services and phase 4 checkboxes are marked complete
only after the integrated validation succeeds.

Phase 4 work lives in `codex/phase-4-docker-compose`, stacked on phase 3 while pull request #4 is
open. Integration remains a separate owner decision; no commit, push or pull request is implicit.
