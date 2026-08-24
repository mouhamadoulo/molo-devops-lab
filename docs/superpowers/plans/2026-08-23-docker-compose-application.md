# Docker and Compose Application Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package the Spring Boot backend and Angular frontend as minimal non-root images, then run the complete four-service DevOps Store stack with healthy dependencies, same-origin API routing, durable data and documented commands.

**Architecture:** Build the backend with pinned Maven/JDK 25 and run only its executable jar on pinned JRE 25. Build Angular with pinned Node 24 and serve only the production bundle from pinned unprivileged Nginx. Docker Compose extends the existing PostgreSQL and AIStor foundation with backend and frontend services; Nginx is the browser entry point, while a separate public AIStor endpoint makes presigned image URLs browser-reachable.

**Tech Stack:** Java 25, Spring Boot 4.1, Maven 3.9.13, MinIO Java 9, Angular 22, Node 24.18.0, npm 11.16.0, Nginx unprivileged 1.29.4, Docker Compose 5.1, PostgreSQL 18.4 and AIStor Free.

**Approved design:** `docs/superpowers/specs/2026-08-23-docker-compose-application-design.md`

**Execution constraints:** Work only in the `codex/phase-4-docker-compose` worktree. Preserve unrelated changes. Do not commit, push, open a pull request or remove persistent user volumes without explicit owner authorization. The commit commands below are authorization checkpoints; skip them unless the owner explicitly authorizes that Git action during execution.

---

### Task 1: Separate AIStor's internal and browser-facing endpoints

**Files:**

- Create: `backend/src/test/java/com/molo/devopsstore/product/infrastructure/MinioPropertiesTest.java`
- Create: `backend/src/test/java/com/molo/devopsstore/product/infrastructure/MinioObjectStorageTest.java`
- Modify: `backend/src/test/java/com/molo/devopsstore/product/infrastructure/MinioObjectStorageIntegrationTest.java`
- Modify: `backend/src/main/java/com/molo/devopsstore/product/infrastructure/MinioProperties.java`
- Modify: `backend/src/main/java/com/molo/devopsstore/product/infrastructure/MinioObjectStorage.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.example`

- [ ] **Step 1: Confirm every direct properties construction before changing the record**

Run from the worktree root:

```powershell
rg -n "new MinioProperties|app\.storage\.minio|MINIO_ENDPOINT" backend .env.example
```

Expected: one direct construction in `MinioObjectStorageIntegrationTest`, one Spring configuration block and the current environment example.

- [ ] **Step 2: Write the failing configuration tests**

Add `MinioPropertiesTest` with these two behaviors:

```java
@Test
void fallsBackToTheInternalEndpointWhenThePublicEndpointIsBlank() {
    var properties = new MinioProperties(
            "http://minio.internal:9000", " ", "access", "secret", "bucket");

    assertThat(properties.publicEndpoint()).isEqualTo("http://minio.internal:9000");
}

@Test
void keepsAnExplicitPublicEndpoint() {
    var properties = new MinioProperties(
            "http://minio.internal:9000", " http://localhost:9000 ", "access", "secret", "bucket");

    assertThat(properties.publicEndpoint()).isEqualTo("http://localhost:9000");
}
```

Add `MinioObjectStorageTest` to construct the storage with internal
`http://minio.internal:9000` and public `http://localhost:9000`, call
`presignGet("products/42/image.jpg", Duration.ofMinutes(5))`, and assert that the returned URI has
host `localhost`, port `9000`, path `/bucket/products/42/image.jpg`, and an AWS signature query.

- [ ] **Step 3: Run the targeted tests and verify RED**

```powershell
Set-Location backend
.\mvnw.cmd -Dtest=MinioPropertiesTest,MinioObjectStorageTest test
```

Expected: compilation fails because `MinioProperties` has no `publicEndpoint` component and still accepts four constructor arguments.

- [ ] **Step 4: Implement the minimal endpoint split**

Change the properties record to five components and normalize the optional public value:

```java
public record MinioProperties(
        String endpoint,
        String publicEndpoint,
        String accessKey,
        String secretKey,
        String bucket,
        String region) {

    public MinioProperties {
        endpoint = requireText(endpoint, "MINIO_ENDPOINT must not be blank");
        publicEndpoint = publicEndpoint == null || publicEndpoint.isBlank()
                ? endpoint
                : publicEndpoint.trim();
        accessKey = requireText(accessKey, "MINIO_ACCESS_KEY must not be blank");
        secretKey = requireText(secretKey, "MINIO_SECRET_KEY must not be blank");
        bucket = requireText(bucket, "MINIO_BUCKET must not be blank");
        region = requireText(region, "MINIO_REGION must not be blank");
    }
}
```

In `MinioObjectStorage`, keep `client` for bucket, put, delete and list calls; add
`presigningClient` built with `properties.publicEndpoint()` and use only that client in
`presignGet`. Configure both clients with `properties.region()` so signing does not attempt region
discovery against the public endpoint.

Configure the fallback without breaking current local and test settings:

```yaml
app:
  storage:
    minio:
      endpoint: ${MINIO_ENDPOINT:http://localhost:9000}
      public-endpoint: ${MINIO_PUBLIC_ENDPOINT:${MINIO_ENDPOINT:http://localhost:9000}}
      region: ${MINIO_REGION:us-east-1}
```

Add `MINIO_PUBLIC_ENDPOINT=http://localhost:9000` beside `MINIO_ENDPOINT` and
`MINIO_REGION=us-east-1` beside the bucket in `.env.example`.
Update the integration test's direct constructor to pass its mapped endpoint for both values.

- [ ] **Step 5: Re-run the focused tests and verify GREEN**

```powershell
Set-Location backend
.\mvnw.cmd -Dtest=MinioPropertiesTest,MinioObjectStorageTest,MinioObjectStorageIntegrationTest test
```

Expected: all three classes pass; the integration test still stores, retrieves and deletes through
the internal endpoint, while the unit test proves that signing uses the public endpoint.

- [ ] **Step 6: Review the focused diff**

```powershell
Set-Location ..
git diff -- backend/src .env.example
git diff --check
```

Expected: no secret value, no caller left on the old constructor and no whitespace errors.

- [ ] **Step 7: Git checkpoint, only if explicitly authorized**

```powershell
git add -- backend/src/main backend/src/test .env.example
git commit -m "feat: separate public object storage endpoint"
```

---

### Task 2: Build a minimal non-root backend image

**Files:**

- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Record the missing-image RED state**

```powershell
Test-Path backend/Dockerfile
docker build --file backend/Dockerfile backend
```

Expected: `Test-Path` returns `False` and Docker cannot find the Dockerfile.

- [ ] **Step 2: Add a narrow backend build context**

Create `backend/.dockerignore` excluding `.mvn`, `mvnw`, `mvnw.cmd`, `target`, `.git`, IDE files,
logs, coverage output and local environment files. The container uses its pinned Maven binary, so
the wrapper is not part of the build context. Do not exclude `pom.xml` or `src`.

- [ ] **Step 3: Add the pinned multi-stage Dockerfile**

Use these immutable manifests:

```dockerfile
FROM maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2 AS build
WORKDIR /workspace
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package \
    && cp target/devops-store-backend-0.1.0-SNAPSHOT.jar application.jar

FROM eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682 AS runtime
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/application.jar application.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
```

Do not run `verify` inside the image build: the verified backend suite requires Docker/Testcontainers
and the unversioned AIStor licence, and it runs separately in the test target.

- [ ] **Step 4: Build the backend image**

```powershell
docker build --pull --tag devops-store-backend:phase4 --file backend/Dockerfile backend
```

Expected: build succeeds and copies only the packaged jar into the runtime stage.

- [ ] **Step 5: Inspect the backend runtime**

```powershell
docker image inspect devops-store-backend:phase4 --format '{{.Config.User}} {{json .Config.Entrypoint}}'
docker run --rm --entrypoint sh devops-store-backend:phase4 -c 'id && java -version && ! command -v mvn && ! command -v javac && test -f /app/application.jar'
```

Expected: configured user `10001:10001`, Java 25 available, Maven/Javac absent and the application
jar present.

- [ ] **Step 6: Git checkpoint, only if explicitly authorized**

```powershell
git add -- backend/Dockerfile backend/.dockerignore
git commit -m "build: add backend runtime image"
```

---

### Task 3: Build the Angular image and hardened Nginx entry point

**Files:**

- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Create: `frontend/nginx.conf`

- [ ] **Step 1: Record the missing frontend image and config RED state**

```powershell
Test-Path frontend/Dockerfile
Test-Path frontend/nginx.conf
docker build --file frontend/Dockerfile frontend
```

Expected: both checks return `False` and the build fails because no Dockerfile exists.

- [ ] **Step 2: Add a narrow frontend build context**

Exclude `node_modules`, `dist`, `coverage`, Playwright reports, caches, logs, IDE files and local
environment files. Keep `package.json`, `package-lock.json`, Angular configuration, TypeScript
configuration, `public` and `src`.

- [ ] **Step 3: Add Nginx SPA and reverse-proxy configuration**

Create a complete `nginx.conf` with `pid /tmp/nginx.pid`, unprivileged temporary paths, a
`map` that preserves an incoming `X-Request-ID` or falls back to Nginx `$request_id`, and a server
listening on 8080. The server must:

```nginx
location /api/ {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id_to_forward;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Apply `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a restrictive Referrer-Policy,
Permissions-Policy and Content-Security-Policy. The CSP allows application resources from self,
Angular inline styles, data/blob images and `http://localhost:9000` for presigned image URLs. Do not
emit HSTS on this HTTP-only local stack.

- [ ] **Step 4: Add the pinned multi-stage frontend Dockerfile**

```dockerfile
FROM node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.4-alpine@sha256:a6c4f61f456b85b8fdf7ec7ab28cc3e299440e6fb4a9dea520e5fd8fd440025e AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html
USER 101:101
EXPOSE 8080
```

- [ ] **Step 5: Build and validate Nginx syntax**

```powershell
docker build --pull --tag devops-store-frontend:phase4 --file frontend/Dockerfile frontend
docker run --rm --add-host backend:127.0.0.1 --entrypoint nginx devops-store-frontend:phase4 -t
```

Expected: build and `nginx -t` succeed.

- [ ] **Step 6: Smoke-test the standalone static runtime**

```powershell
docker run --detach --rm --name devops-store-frontend-phase4 --add-host backend:127.0.0.1 -p 127.0.0.1:4300:8080 devops-store-frontend:phase4
curl.exe --fail --silent --show-error http://127.0.0.1:4300/
curl.exe --fail --silent --show-error http://127.0.0.1:4300/products
curl.exe --head --silent http://127.0.0.1:4300/
docker exec devops-store-frontend-phase4 sh -c 'id && ! command -v node && ! command -v npm'
docker stop devops-store-frontend-phase4
```

Expected: root and `/products` return Angular HTML, defensive headers are present, the process is
user 101 and Node/npm are absent. A 502 on `/api` is expected in this standalone check.

- [ ] **Step 7: Git checkpoint, only if explicitly authorized**

```powershell
git add -- frontend/Dockerfile frontend/.dockerignore frontend/nginx.conf
git commit -m "build: add frontend nginx image"
```

---

### Task 4: Extend Compose to the full application stack

**Files:**

- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Capture the current Compose RED state**

With validation-only environment variables set in the current shell, run:

```powershell
docker compose config --services
```

Expected: output contains only `postgres`, `object-storage-permissions` and `object-storage`; it
does not contain `backend` or `frontend`.

- [ ] **Step 2: Make required values fail at configuration time**

Replace usable password defaults with required-variable expressions carrying actionable messages.
Require at least `DB_PASSWORD`, `MINIO_LICENSE_FILE`, `MINIO_SECRET_KEY`, `JWT_SECRET`,
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` and `BOOTSTRAP_ADMIN_NAME`. Keep non-sensitive
names, ports, bucket and access key configurable with local defaults. The tracked `.env.example`
contains names and safe endpoints, but all passwords/secrets remain blank.

- [ ] **Step 3: Add the backend service**

Configure build context `./backend`, image `devops-store-backend:local`, numeric user, init process,
`read_only: true`, `/tmp` tmpfs, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, bounded
resources, restart policy, `SIGTERM` and a Spring-compatible grace period. Pass:

```yaml
DB_URL: jdbc:postgresql://postgres:5432/${DB_NAME:-devops_store}
MINIO_ENDPOINT: http://object-storage:9000
MINIO_PUBLIC_ENDPOINT: ${MINIO_PUBLIC_ENDPOINT:-http://localhost:9000}
MINIO_INITIALIZE_BUCKET: "true"
AUTH_COOKIE_SECURE: "false"
```

Also pass the required database, JWT, bootstrap and AIStor credentials. Bind
`127.0.0.1:${BACKEND_PORT:-8080}:8080`. Wait for PostgreSQL and object storage with
`condition: service_healthy`; use a bounded `/actuator/health` healthcheck.

- [ ] **Step 4: Add the frontend service**

Configure build context `./frontend`, image `devops-store-frontend:local`, numeric user 101,
read-only root, `/tmp` tmpfs, capability drop, `no-new-privileges`, bounded resources, restart and
graceful stop. Bind `127.0.0.1:${FRONTEND_PORT:-4200}:8080`, healthcheck `/`, and wait for backend
with `condition: service_healthy`.

- [ ] **Step 5: Harden and bound the existing infrastructure services**

Retain the pinned PostgreSQL and AIStor digests, read-only licence mount and one-shot permissions
initializer. Bind every published port to `127.0.0.1`; add compatible `no-new-privileges`,
capability, restart, stop-grace and CPU/memory settings without breaking the ownership initializer.
Keep named PostgreSQL and object-storage volumes and the private application bridge network.

- [ ] **Step 6: Prove missing configuration fails clearly**

In a fresh shell without a project `.env`, run `docker compose config`. Expected: non-zero exit and
an explicit message naming the first missing required value. Do not print or inspect the licence
contents.

- [ ] **Step 7: Render and inspect valid configuration**

Set validation-only values in the current process, including the absolute existing licence path,
then run:

```powershell
docker compose config --quiet
docker compose config --services
docker compose config --images
docker compose config | Select-String "127.0.0.1:"
```

Expected: valid rendering, five containers listed, four durable service images, and every host
mapping bound to loopback. Never save rendered config because it contains interpolated secrets.

- [ ] **Step 8: Git checkpoint, only if explicitly authorized**

```powershell
git add -- docker-compose.yml .env.example
git commit -m "feat: compose the complete local stack"
```

---

### Task 5: Add the documented Make interface

**Files:**

- Create: `Makefile`

- [ ] **Step 1: Record the missing Makefile RED state**

```powershell
Test-Path Makefile
make help
```

Expected: `Test-Path` returns `False`; `make` either reports no Makefile or is unavailable on the
Windows host.

- [ ] **Step 2: Implement thin, self-documented targets**

Add `.DEFAULT_GOAL := help`, `.PHONY` declarations and these targets:

```make
COMPOSE ?= docker compose

application: build up
build:
	$(COMPOSE) build --pull
test: backend-test frontend-test
backend-test:
	cd backend && ./mvnw clean verify
frontend-test:
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build
up:
	$(COMPOSE) up -d
down:
	$(COMPOSE) down
status:
	$(COMPOSE) ps
logs:
	$(COMPOSE) logs --follow --tail=200
```

Implement `help` from `##` target comments. Do not add a hidden `down --volumes` or destructive
cleanup target.

- [ ] **Step 3: Validate target parsing**

If GNU Make is installed, run:

```powershell
make help
make --dry-run application
make --dry-run test
```

Otherwise validate with an ephemeral GNU Make container mounting the worktree read-only, then use
the direct Maven/npm/Compose commands for all real verification. Expected: all ten target names are
shown and the dry runs expand to the documented commands.

- [ ] **Step 4: Git checkpoint, only if explicitly authorized**

```powershell
git add -- Makefile
git commit -m "build: add local application commands"
```

---

### Task 6: Prove the complete stack, proxy and persistence

**Files:**

- Test only; do not create a tracked credential or smoke-test output file.

- [ ] **Step 1: Preflight ports and isolate the validation project**

Check ports 4200, 8080, 5432, 9000 and 9001. If an unrelated process owns one, stop and report it;
do not terminate it. Use Compose project name `devops-store-phase4` so validation containers and
volumes cannot collide with the user's normal project.

- [ ] **Step 2: Build both application images through Compose**

Set validation-only environment values in the current PowerShell process and run:

```powershell
docker compose --project-name devops-store-phase4 build --pull backend frontend
```

Expected: both pinned multi-stage builds succeed.

- [ ] **Step 3: Start the full stack and wait for health**

```powershell
docker compose --project-name devops-store-phase4 up --detach --wait --wait-timeout 180
docker compose --project-name devops-store-phase4 ps
```

Expected: PostgreSQL, AIStor, backend and frontend are healthy; the permissions container exited
successfully.

- [ ] **Step 4: Verify direct health, SPA fallback and reverse proxy**

```powershell
curl.exe --fail --silent --show-error http://127.0.0.1:8080/actuator/health
curl.exe --fail --silent --show-error http://127.0.0.1:4200/
curl.exe --fail --silent --show-error http://127.0.0.1:4200/products
curl.exe --silent --output NUL --write-out "%{http_code}" http://127.0.0.1:4200/api/v1/products
```

Expected: health is `UP`, both frontend paths return Angular HTML and the proxied anonymous API call
returns Spring Security `401` rather than Nginx `404` or `502`.

- [ ] **Step 5: Verify migrations and seed data**

Use `docker compose exec -T postgres psql` with the configured database user to query Flyway's
latest successful version and `SELECT count(*) FROM products;`.

Expected: the latest repository migration is successful and at least one sample product exists.

- [ ] **Step 6: Verify browser-facing presigned URLs end to end**

Log in through `http://127.0.0.1:4200/api/v1/auth/login` using the validation admin and retain the
returned access token only in process memory. Generate the test's existing 1x1 WebP fixture from its
Base64 literal in the operating system's temporary directory, then upload it to product 1 through
Nginx. Assert that the returned image URL begins with `http://localhost:9000/` and that an HTTP GET
of that URL returns 200. Delete the temporary image in a `finally` block. Do not write credentials,
tokens or cookie jars inside the repository.

- [ ] **Step 7: Verify persistence across a normal restart**

Capture the product count and uploaded image object key, restart `postgres` and `object-storage`,
wait for health, then re-run the database count and signed image GET.

Expected: the count is unchanged and the uploaded object remains readable.

- [ ] **Step 8: Re-inspect running container confinement**

Use `docker inspect` and `docker compose exec` to confirm numeric non-root users, read-only roots,
`no-new-privileges`, dropped capabilities, configured healthchecks and absence of Maven/Node/npm in
the runtime containers.

- [ ] **Step 9: Clean only the isolated validation project**

First inspect `docker compose --project-name devops-store-phase4 ps --all` and verify every target
has the exact Compose project label `devops-store-phase4`. Then, and only then, remove the ephemeral
validation containers and validation volumes:

```powershell
docker compose --project-name devops-store-phase4 down --volumes
```

Report that only the isolated test project and its disposable volumes were removed. Never use this
command against the user's default `devops-store` project.

---

### Task 7: Document the delivered workflow and close phase 4

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Create: `docs/infrastructure/docker.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Update repository status and quick start**

Replace statements that application images are merely planned. Document prerequisites, `.env`
creation, AIStor licence path, required secret generation, `make application`, direct PowerShell
Compose equivalents, URLs, status/log/down commands and the fact that `down` preserves data.

- [ ] **Step 2: Add focused Docker operations documentation**

In `docs/infrastructure/docker.md`, explain image stages and pinned digests, non-root runtime users,
the Nginx `/api` request flow, `MINIO_ENDPOINT` versus `MINIO_PUBLIC_ENDPOINT`, service health order,
loopback bindings, persistent volumes, licence constraints and troubleshooting for missing values,
occupied ports, unhealthy services and 502 responses.

- [ ] **Step 3: Correct and complete the implementation plan**

In phase 4, replace “three services” with four durable healthy services plus the successful one-shot
initializer. Mark a checkbox complete only if its implementation and acceptance evidence exist.
Keep CI/CD, registry publication and observability explicitly planned for later phases.

- [ ] **Step 4: Keep the documentation index and agent instructions truthful**

Ensure `docs/README.md` links the new Docker guide. Update `AGENTS.md` with the available Make and
Compose commands and current architecture without announcing any future-only target as available.

- [ ] **Step 5: Git checkpoint, only if explicitly authorized**

```powershell
git add -- README.md AGENTS.md docs/README.md docs/infrastructure/docker.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document the application stack"
```

---

### Task 8: Run final regression and review the branch

**Files:**

- Verify all modified files; edit only to resolve a demonstrated failure or review finding.

- [ ] **Step 1: Run the complete backend verification**

From `backend`, with Docker and the AIStor licence available:

```powershell
.\mvnw.cmd clean verify
```

Expected: Maven exits 0, all unit/integration tests pass and JaCoCo verification succeeds.

- [ ] **Step 2: Run the complete frontend verification**

From `frontend`:

```powershell
npm ci
npm run lint
npm test -- --watch=false --coverage
npm run build
npm run e2e
```

Expected: clean install, lint, all unit tests with coverage, production build and Playwright all exit
0.

- [ ] **Step 3: Repeat immutable image and Compose acceptance checks**

Run Compose configuration validation, both image builds, Nginx syntax, full-stack health and the
Task 6 smoke path once more after documentation/fixes. Expected: no regression.

- [ ] **Step 4: Inspect the complete diff and repository hygiene**

```powershell
git status --short
git diff --stat
git diff
git diff --check
git ls-files | rg "(^|/)(\.env$|minio\.license$|node_modules|target|dist|coverage|playwright-report)"
```

Expected: only phase 4 source/config/docs changes are present; no secret, licence, build output or
cache is tracked; `git diff --check` is clean.

- [ ] **Step 5: Perform local code review**

Review requirements one by one against the approved design and inspect for secret leakage, mutable
base tags, root runtime, invalid health ordering, browser-inaccessible signed URLs, destructive
Make targets and misleading documentation. Fix only findings backed by evidence, then re-run their
nearest verification.

- [ ] **Step 6: Apply verification-before-completion and branch-finishing workflows**

Record the final command results before claiming success. Present the owner with integration choices
for the stacked branch. Do not commit, push, merge or open a pull request unless the owner explicitly
chooses and authorizes that action.
