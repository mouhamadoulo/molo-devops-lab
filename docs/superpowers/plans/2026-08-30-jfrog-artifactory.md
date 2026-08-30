# JFrog Artifact Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un parcours reproductible qui publie, résout et promeut le JAR backend avec Artifactory OSS, tout en séparant le registre Docker JCR optionnel.

**Architecture:** `docker-compose.devops.yml` héberge Artifactory OSS/PostgreSQL 17 dans `artifacts` et JCR/PostgreSQL 17 dans `registry`. Cinq configurations Maven servent de référence pour la création initiale dans l’interface OSS, puis un service conteneurisé vérifie leur présence par l’API publique. Les autres helpers promeuvent une candidate sans écrasement et résolvent depuis un virtual avec cache vierge. Maven reste natif ; la CI backend publie seulement après vérification, sur `main` ou tag SemVer.

**Tech Stack:** JFrog Artifactory OSS/JCR 7.161.20, PostgreSQL 17.10, curl 8.16.0, Maven Wrapper 3.9.13, Java 25, Docker Compose 5.1, GNU Make et GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-30-jfrog-artifactory-design.md`

## Global Constraints

- Épingler Artifactory OSS à `7.161.20@sha256:b0e71ce0c1cca3a4028c56e5afeacfe7280602f56be961e2c756e5a3deee482a`.
- Épingler JCR à `7.161.20@sha256:d17bb796de9e1f77e521e0b28b5121acc1edcc873ef308245865e04c343da2dc`, uniquement dans `registry`.
- Épingler PostgreSQL à `17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`; PostgreSQL 18 est interdit pour JFrog.
- Épingler le client REST à `curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6`.
- Épingler le consommateur Maven à `maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2`.
- Garantir seulement les capacités OSS Maven, local/remote/virtual et checksum deploy.
- Ne jamais présenter JCR, Xray, release bundles ou promotion de build native comme une capacité OSS.
- Ne jamais versionner `.env`, token, mot de passe, cache Maven de validation ou état JFrog.
- Publier `0.1.0-SNAPSHOT` depuis `main` et `X.Y.Z` depuis un tag exact `vX.Y.Z`; aucune PR ne publie.
- Exclure candidates du virtual ; une candidate devient résoluble uniquement après promotion.
- Copier lors d’une promotion ; refuser snapshot, candidat absent et release existante.
- Ne modifier ni migration Flyway ni comportement métier.
- Ne jamais annoncer JCR, workflow distant ou publication distante comme validé sans sortie réelle.
- Ne créer aucun commit, push ou PR sans autorisation explicite. Les étapes de commit sont conditionnelles.
- À l’exécution, utiliser `superpowers:using-git-worktrees` si isolé, `superpowers:test-driven-development` pour les changements et `superpowers:verification-before-completion` avant le bilan.

## File Map

| Fichier | Responsabilité |
|---|---|
| `docker-compose.devops.yml` | Profils, helpers, healthchecks, ressources, réseaux et volumes |
| `.env.example` | Paramètres non sensibles et emplacements secrets vides |
| `Makefile` | Cycle de vie, bootstrap, publication, promotion et résolution |
| `infrastructure/jfrog/repositories/*.json` | Cinq repositories Maven déclaratifs |
| `infrastructure/jfrog/bootstrap.sh` | Vérification idempotente par l’API Storage publique |
| `infrastructure/jfrog/promote.sh` | Copie défensive candidate vers releases |
| `infrastructure/jfrog/settings.xml.example` | Mirror virtual et credentials Maven d’environnement |
| `backend/pom.xml` | `${revision}` et `distributionManagement` |
| `.github/workflows/backend-ci.yml` | Vérification puis publication conditionnelle du même SHA |
| `docs/devops/jfrog-artifactory.md` | Exploitation, sécurité, CI, limites et dépannage |
| `docs/devops/github-actions.md` | Déclenchements et secrets du job de publication |
| `README.md`, `docs/README.md`, `AGENTS.md` | État réel, index, variables et commandes |
| `docs/IMPLEMENTATION_PLAN.md` | Versions, cases et preuves d’acceptance |

---

### Task 0: Baseline, provenance et espace d’exécution

**Files:**
- Read: `docs/superpowers/specs/2026-08-30-jfrog-artifactory-design.md`
- Read: `docs/superpowers/plans/2026-08-30-jfrog-artifactory.md`
- No production files modified.

**Interfaces:**
- Consumes: checkout Git, Docker Desktop Linux, Buildx, Make, Maven Wrapper et licence AIStor.
- Produces: workspace approuvé, baseline verte ou échecs préexistants, digests revérifiés.

- [x] **Step 1: Contrôler l’espace de travail**

Si l’utilisateur choisit un worktree, invoquer `superpowers:using-git-worktrees`. Sinon obtenir son
accord explicite pour le workspace courant.

```powershell
git branch --show-current
git status -sb
git worktree list
git log -3 --oneline --decorate
```

Expected: branche/worktree connus ; changements utilisateur hors phase 9 identifiés et préservés.

- [x] **Step 2: Revérifier les images**

```powershell
docker buildx imagetools inspect releases-docker.jfrog.io/jfrog/artifactory-oss:7.161.20
docker buildx imagetools inspect releases-docker.jfrog.io/jfrog/artifactory-jcr:7.161.20
docker buildx imagetools inspect postgres:17.10-alpine
docker buildx imagetools inspect curlimages/curl:8.16.0
```

Expected: digests égaux aux contraintes globales, avec `linux/arm64` et `linux/amd64`.

- [x] **Step 3: Valider les contrôleurs existants**

```powershell
docker version
make --version
docker compose config --quiet
make ci-lint
git diff --check
```

Expected: Docker, Compose, Make, actionlint et Git répondent sans erreur.

- [x] **Step 4: Établir la baseline backend**

```powershell
Set-Location backend
./mvnw.cmd -B clean verify
Set-Location ..
```

Expected: suite backend verte avec PostgreSQL/AIStor réels. Si la licence ou Docker manque,
consigner le prérequis sans attribuer l’échec à la phase 9.

---

### Task 1: Profils Compose, variables et cycle de vie

**Files:**
- Modify: `docker-compose.devops.yml:3-77`
- Modify: `.env.example:1-39`
- Modify: `Makefile:1-64`
- Modify: `Makefile:156-179`

**Interfaces:**
- Consumes: `DEVOPS_COMPOSE`, images épinglées et variables `.env`.
- Produces: `artifactory-db`, `artifactory`, `jcr-db`, `jcr`, réseaux/volumes et cibles de cycle de vie.

- [x] **Step 1: Observer les interfaces absentes**

```powershell
make artifacts-config
make registry-config
```

Expected: FAIL `No rule to make target` pour les deux.

- [x] **Step 2: Ajouter les variables d’exemple**

```dotenv
# JFrog Artifactory OSS local: keep passwords and tokens outside Git
ARTIFACTORY_PORT=8082
ARTIFACTORY_DB_NAME=artifactory
ARTIFACTORY_DB_USERNAME=artifactory
ARTIFACTORY_DB_PASSWORD=
JFROG_URL=http://localhost:8082/artifactory
JFROG_ADMIN_TOKEN=
JFROG_USERNAME=
JFROG_TOKEN=

# Optional JFrog Container Registry profile
JCR_PORT=8084
JCR_DB_NAME=jcr
JCR_DB_USERNAME=jcr
JCR_DB_PASSWORD=
```

- [x] **Step 3: Ajouter PostgreSQL Artifactory**

```yaml
  artifactory-db:
    profiles: [artifacts]
    image: postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193
    environment:
      POSTGRES_DB: ${ARTIFACTORY_DB_NAME:-artifactory}
      POSTGRES_USER: ${ARTIFACTORY_DB_USERNAME:-artifactory}
      POSTGRES_PASSWORD: ${ARTIFACTORY_DB_PASSWORD:-}
    command:
      - sh
      - -ec
      - >-
        test -n "$$POSTGRES_PASSWORD" || { echo 'ARTIFACTORY_DB_PASSWORD is required' >&2; exit 1; };
        exec docker-entrypoint.sh postgres
    volumes:
      - artifactory-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 10s
    networks: [artifacts]
    restart: unless-stopped
    stop_grace_period: 30s
    security_opt: [no-new-privileges:true]
    cpus: 0.5
    mem_limit: 512m
    pids_limit: 200
```

- [x] **Step 4: Ajouter Artifactory OSS**

```yaml
  artifactory:
    profiles: [artifacts]
    image: releases-docker.jfrog.io/jfrog/artifactory-oss:7.161.20@sha256:b0e71ce0c1cca3a4028c56e5afeacfe7280602f56be961e2c756e5a3deee482a
    environment:
      JF_SHARED_DATABASE_TYPE: postgresql
      JF_SHARED_DATABASE_DRIVER: org.postgresql.Driver
      JF_SHARED_DATABASE_URL: jdbc:postgresql://artifactory-db:5432/${ARTIFACTORY_DB_NAME:-artifactory}
      JF_SHARED_DATABASE_USERNAME: ${ARTIFACTORY_DB_USERNAME:-artifactory}
      JF_SHARED_DATABASE_PASSWORD: ${ARTIFACTORY_DB_PASSWORD:-}
      JF_SHARED_EXTRAJAVAOPTS: -Xms512m -Xmx2g
    ports:
      - "127.0.0.1:${ARTIFACTORY_PORT:-8082}:8082"
    volumes:
      - artifactory-data:/var/opt/jfrog/artifactory
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          bash -c 'exec 3<>/dev/tcp/127.0.0.1/8082 &&
          printf "GET /router/api/v1/system/readiness HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3 &&
          read -r status <&3 && [[ "$$status" == *" 200 "* ]]'
      interval: 15s
      timeout: 10s
      retries: 40
      start_period: 120s
    depends_on:
      artifactory-db:
        condition: service_healthy
    networks: [artifacts]
    restart: unless-stopped
    stop_grace_period: 120s
    security_opt: [no-new-privileges:true]
    cpus: 4.0
    mem_limit: 4g
    pids_limit: 1000
```

- [x] **Step 5: Ajouter le profil JCR isolé**

```yaml
  jcr-db:
    profiles: [registry]
    image: postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193
    environment:
      POSTGRES_DB: ${JCR_DB_NAME:-jcr}
      POSTGRES_USER: ${JCR_DB_USERNAME:-jcr}
      POSTGRES_PASSWORD: ${JCR_DB_PASSWORD:-}
    command:
      - sh
      - -ec
      - >-
        test -n "$$POSTGRES_PASSWORD" || { echo 'JCR_DB_PASSWORD is required' >&2; exit 1; };
        exec docker-entrypoint.sh postgres
    volumes:
      - jcr-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 10s
    networks: [registry]
    restart: unless-stopped
    stop_grace_period: 30s
    security_opt: [no-new-privileges:true]
    cpus: 0.5
    mem_limit: 512m
    pids_limit: 200

  jcr:
    profiles: [registry]
    image: releases-docker.jfrog.io/jfrog/artifactory-jcr:7.161.20@sha256:d17bb796de9e1f77e521e0b28b5121acc1edcc873ef308245865e04c343da2dc
    environment:
      JF_SHARED_DATABASE_TYPE: postgresql
      JF_SHARED_DATABASE_DRIVER: org.postgresql.Driver
      JF_SHARED_DATABASE_URL: jdbc:postgresql://jcr-db:5432/${JCR_DB_NAME:-jcr}
      JF_SHARED_DATABASE_USERNAME: ${JCR_DB_USERNAME:-jcr}
      JF_SHARED_DATABASE_PASSWORD: ${JCR_DB_PASSWORD:-}
      JF_SHARED_EXTRAJAVAOPTS: -Xms512m -Xmx2g
    ports:
      - "127.0.0.1:${JCR_PORT:-8084}:8082"
    volumes:
      - jcr-data:/var/opt/jfrog/artifactory
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          bash -c 'exec 3<>/dev/tcp/127.0.0.1/8082 &&
          printf "GET /router/api/v1/system/readiness HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3 &&
          read -r status <&3 && [[ "$$status" == *" 200 "* ]]'
      interval: 15s
      timeout: 10s
      retries: 40
      start_period: 120s
    depends_on:
      jcr-db:
        condition: service_healthy
    networks: [registry]
    restart: unless-stopped
    stop_grace_period: 120s
    security_opt: [no-new-privileges:true]
    cpus: 4.0
    mem_limit: 4g
    pids_limit: 1000
```

- [x] **Step 6: Déclarer réseaux et volumes**

Ajouter sans altérer les entrées quality :

```yaml
  artifacts:
    driver: bridge
  registry:
    driver: bridge
```

```yaml
  artifactory-postgres-data:
  artifactory-data:
  jcr-postgres-data:
  jcr-data:
```

- [x] **Step 7: Ajouter les cibles Make**

Étendre `.PHONY`, `help`, puis ajouter les couples suivants :

```make
artifacts-config:
	$(DEVOPS_COMPOSE) --profile artifacts config --quiet
artifacts-up:
	$(DEVOPS_COMPOSE) --profile artifacts up -d --wait
artifacts-down:
	$(DEVOPS_COMPOSE) --profile artifacts down
artifacts-status:
	$(DEVOPS_COMPOSE) --profile artifacts ps
artifacts-logs:
	$(DEVOPS_COMPOSE) --profile artifacts logs --follow --tail=200
artifacts-reset:
	$(DEVOPS_COMPOSE) --profile artifacts down --volumes

registry-config:
	$(DEVOPS_COMPOSE) --profile registry config --quiet
registry-up:
	$(DEVOPS_COMPOSE) --profile registry up -d --wait
registry-down:
	$(DEVOPS_COMPOSE) --profile registry down
registry-status:
	$(DEVOPS_COMPOSE) --profile registry ps
registry-logs:
	$(DEVOPS_COMPOSE) --profile registry logs --follow --tail=200
registry-reset:
	$(DEVOPS_COMPOSE) --profile registry down --volumes
```

- [x] **Step 8: Valider les profils sans démarrer JCR**

```powershell
$env:ARTIFACTORY_DB_PASSWORD = 'phase9-artifactory-validation-only'
$env:JCR_DB_PASSWORD = 'phase9-jcr-validation-only'
make artifacts-config
make registry-config
docker compose -f docker-compose.devops.yml --profile artifacts config --services
docker compose -f docker-compose.devops.yml --profile registry config --services
Remove-Item Env:ARTIFACTORY_DB_PASSWORD
Remove-Item Env:JCR_DB_PASSWORD
```

Expected: services Artifactory et JCR isolés, configuration verte, aucun secret écrit.

- [ ] **Step 9: Commit conditionnel**

```powershell
git add -- docker-compose.devops.yml .env.example Makefile
git commit -m "infra: add JFrog runtime profiles"
```

Exécuter seulement avec autorisation ; sinon poursuivre sans staging.

---

### Task 2: Topologie Maven et vérification idempotente compatible OSS

**Files:**
- Create: `infrastructure/jfrog/repositories/devops-store-snapshots-local.json`
- Create: `infrastructure/jfrog/repositories/devops-store-candidates-local.json`
- Create: `infrastructure/jfrog/repositories/devops-store-releases-local.json`
- Create: `infrastructure/jfrog/repositories/maven-central-remote.json`
- Create: `infrastructure/jfrog/repositories/devops-store-maven-virtual.json`
- Create: `infrastructure/jfrog/bootstrap.sh`
- Modify: `docker-compose.devops.yml`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `artifactory`, réseau `artifacts`, `JFROG_ADMIN_TOKEN`, curl épinglé.
- Produces: `artifactory-bootstrap`, `artifacts-verify`, l’alias `artifacts-bootstrap` et la preuve
  que les cinq repositories créés dans l’interface sont disponibles.

- [x] **Step 1: Observer les contrats absents**

```powershell
Test-Path infrastructure/jfrog/bootstrap.sh
Get-ChildItem infrastructure/jfrog/repositories -ErrorAction SilentlyContinue
make artifacts-bootstrap
```

Expected: chemins absents et cible Make inconnue.

- [x] **Step 2: Créer les trois locals Maven**

Snapshots :

```json
{
  "key": "devops-store-snapshots-local",
  "rclass": "local",
  "packageType": "maven",
  "repoLayoutRef": "maven-2-default",
  "handleReleases": false,
  "handleSnapshots": true,
  "maxUniqueSnapshots": 5,
  "snapshotVersionBehavior": "unique"
}
```

Candidates :

```json
{
  "key": "devops-store-candidates-local",
  "rclass": "local",
  "packageType": "maven",
  "repoLayoutRef": "maven-2-default",
  "handleReleases": true,
  "handleSnapshots": false
}
```

Releases :

```json
{
  "key": "devops-store-releases-local",
  "rclass": "local",
  "packageType": "maven",
  "repoLayoutRef": "maven-2-default",
  "handleReleases": true,
  "handleSnapshots": false
}
```

- [x] **Step 3: Créer remote et virtual**

```json
{
  "key": "maven-central-remote",
  "rclass": "remote",
  "packageType": "maven",
  "url": "https://repo.maven.apache.org/maven2/",
  "repoLayoutRef": "maven-2-default",
  "handleReleases": true,
  "handleSnapshots": false
}
```

```json
{
  "key": "devops-store-maven-virtual",
  "rclass": "virtual",
  "packageType": "maven",
  "repoLayoutRef": "maven-2-default",
  "repositories": [
    "devops-store-releases-local",
    "devops-store-snapshots-local",
    "maven-central-remote"
  ],
  "defaultDeploymentRepo": "devops-store-snapshots-local"
}
```

- [x] **Step 4: Valider les cinq JSON**

```powershell
Get-ChildItem infrastructure/jfrog/repositories/*.json | ForEach-Object {
  Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
$virtual = Get-Content -Raw infrastructure/jfrog/repositories/devops-store-maven-virtual.json | ConvertFrom-Json
$virtual.repositories
```

Expected: cinq JSON valides ; ordre releases/snapshots/remote ; candidates absent.

- [x] **Step 5: Écrire le vérificateur OSS idempotent**

Créer `infrastructure/jfrog/bootstrap.sh` :

```sh
#!/bin/sh
set -eu

: "${JFROG_INTERNAL_URL:?JFROG_INTERNAL_URL is required}"
: "${JFROG_ADMIN_TOKEN:?JFROG_ADMIN_TOKEN is required}"
REPOSITORY_DIR=${REPOSITORY_DIR:-/opt/jfrog/repositories}

apply_repository() {
    file=$1
    key=$2
    body=/tmp/jfrog-response
    code=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' \
        --header "Authorization: Bearer ${JFROG_ADMIN_TOKEN}" \
        "${JFROG_INTERNAL_URL}/api/repositories/${key}")
    case "$code" in
        200) method=POST ;;
        404) method=PUT ;;
        *) echo "Cannot inspect repository ${key}: HTTP ${code}" >&2; exit 1 ;;
    esac
    code=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' \
        --request "$method" \
        --header "Authorization: Bearer ${JFROG_ADMIN_TOKEN}" \
        --header 'Content-Type: application/json' \
        --data-binary "@${file}" \
        "${JFROG_INTERNAL_URL}/api/repositories/${key}")
    [ "$code" = 200 ] || { echo "Cannot apply repository ${key}: HTTP ${code}" >&2; exit 1; }
    code=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' \
        --header "Authorization: Bearer ${JFROG_ADMIN_TOKEN}" \
        "${JFROG_INTERNAL_URL}/api/repositories/${key}")
    [ "$code" = 200 ] || { echo "Cannot verify repository ${key}: HTTP ${code}" >&2; exit 1; }
    echo "Repository ${key} is configured"
}

for key in \
    devops-store-snapshots-local \
    devops-store-candidates-local \
    devops-store-releases-local \
    maven-central-remote \
    devops-store-maven-virtual
do
    apply_repository "${REPOSITORY_DIR}/${key}.json" "$key"
done
```

- [x] **Step 6: Ajouter helper Compose et cible Make**

```yaml
  artifactory-bootstrap:
    profiles: [artifacts-tools]
    image: curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6
    environment:
      JFROG_INTERNAL_URL: http://artifactory:8082/artifactory
      JFROG_ADMIN_TOKEN: ${JFROG_ADMIN_TOKEN:-}
    volumes:
      - ./infrastructure/jfrog/bootstrap.sh:/opt/jfrog/bootstrap.sh:ro
      - ./infrastructure/jfrog/repositories:/opt/jfrog/repositories:ro
    entrypoint: [/bin/sh, /opt/jfrog/bootstrap.sh]
    depends_on:
      artifactory:
        condition: service_healthy
    networks: [artifacts]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
```

```make
artifacts-bootstrap:
	$(DEVOPS_COMPOSE) run --rm artifactory-bootstrap
```

- [x] **Step 7: Tester le préflight sans réseau**

```powershell
docker run --rm --entrypoint /bin/sh `
  -v "${PWD}/infrastructure/jfrog/bootstrap.sh:/opt/jfrog/bootstrap.sh:ro" `
  curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6 `
  /opt/jfrog/bootstrap.sh
```

Expected: FAIL `JFROG_INTERNAL_URL is required`, avant réseau.

- [x] **Step 8: Démarrer et effectuer l’onboarding**

Avec `ARTIFACTORY_DB_PASSWORD` réel hors Git :

```powershell
make artifacts-up
make artifacts-status
curl.exe --fail http://localhost:8082/router/api/v1/system/readiness
```

Expected: services sains. L’utilisateur ouvre `http://localhost:8082`, remplace `admin/password`,
génère un identity token administrateur, fournit `JFROG_ADMIN_TOKEN` hors Git et crée les cinq
repositories d’après les JSON. La création REST est réservée à Artifactory Pro.

- [x] **Step 9: Prouver l’idempotence de la vérification**

```powershell
make artifacts-verify
make artifacts-verify
```

Expected: cinq repositories disponibles lors des deux contrôles, sans mutation ni token affiché.

- [ ] **Step 10: Commit conditionnel**

```powershell
git add -- docker-compose.devops.yml Makefile infrastructure/jfrog/bootstrap.sh infrastructure/jfrog/repositories
git commit -m "infra: bootstrap Maven repositories"
```

Exécuter seulement avec autorisation.

---

### Task 3: Version Maven, credentials et publication

**Files:**
- Create: `infrastructure/jfrog/settings.xml.example`
- Modify: `backend/pom.xml:14-37`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `JFROG_URL`, `JFROG_USERNAME`, `JFROG_TOKEN` et repositories Task 2.
- Produces: `${revision}`, deux server IDs et cibles snapshot/candidate.

- [ ] **Step 1: Exécuter le contrôle rouge Maven**

```powershell
Set-Location backend
./mvnw.cmd -q help:evaluate -Dexpression=revision -DforceStdout
Set-Location ..
```

Expected: expression `revision` absente.

- [ ] **Step 2: Rendre la version CI-friendly**

```xml
    <groupId>com.molo</groupId>
    <artifactId>devops-store-backend</artifactId>
    <version>${revision}</version>

    <properties>
        <revision>0.1.0-SNAPSHOT</revision>
```

- [ ] **Step 3: Ajouter `distributionManagement` avant `<build>`**

```xml
    <distributionManagement>
        <repository>
            <id>devops-store-candidates</id>
            <name>DevOps Store release candidates</name>
            <url>${env.JFROG_URL}/devops-store-candidates-local</url>
        </repository>
        <snapshotRepository>
            <id>devops-store-snapshots</id>
            <name>DevOps Store snapshots</name>
            <url>${env.JFROG_URL}/devops-store-snapshots-local</url>
        </snapshotRepository>
    </distributionManagement>
```

- [ ] **Step 4: Créer le settings sans secret**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">
    <servers>
        <server>
            <id>devops-store-snapshots</id>
            <username>${env.JFROG_USERNAME}</username>
            <password>${env.JFROG_TOKEN}</password>
        </server>
        <server>
            <id>devops-store-candidates</id>
            <username>${env.JFROG_USERNAME}</username>
            <password>${env.JFROG_TOKEN}</password>
        </server>
        <server>
            <id>devops-store-maven-virtual</id>
            <username>${env.JFROG_USERNAME}</username>
            <password>${env.JFROG_TOKEN}</password>
        </server>
    </servers>
    <mirrors>
        <mirror>
            <id>devops-store-maven-virtual</id>
            <name>DevOps Store Maven virtual</name>
            <url>${env.JFROG_URL}/devops-store-maven-virtual</url>
            <mirrorOf>*</mirrorOf>
        </mirror>
    </mirrors>
</settings>
```

- [ ] **Step 5: Ajouter les cibles avec versions strictes**

```make
artifacts-publish-snapshot:
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z-SNAPSHOT is required" >&2; exit 1; }
	@echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+-SNAPSHOT$$' || { echo "VERSION must match X.Y.Z-SNAPSHOT" >&2; exit 1; }
	cd backend && ./mvnw -B -s ../infrastructure/jfrog/settings.xml.example -Drevision=$(VERSION) deploy

artifacts-publish-candidate:
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z is required" >&2; exit 1; }
	@echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "VERSION must match X.Y.Z" >&2; exit 1; }
	cd backend && ./mvnw -B -s ../infrastructure/jfrog/settings.xml.example -Drevision=$(VERSION) deploy
```

- [ ] **Step 6: Vérifier POM et tests**

```powershell
Set-Location backend
./mvnw.cmd -q help:evaluate -Dexpression=project.version -DforceStdout
./mvnw.cmd -q help:evaluate -Dexpression=project.distributionManagement.snapshotRepository.id -DforceStdout
./mvnw.cmd -q help:evaluate -Dexpression=project.distributionManagement.repository.id -DforceStdout
./mvnw.cmd -B clean verify
Set-Location ..
```

Expected: `0.1.0-SNAPSHOT`, `devops-store-snapshots`, `devops-store-candidates`, suite verte.

- [ ] **Step 7: Exporter les credentials dans le shell hôte**

Le fichier `.env` est lu par Docker Compose, pas par Maven exécuté sur l’hôte. Dans PowerShell,
exporter explicitement les mêmes valeurs locales avant toute cible `artifacts-publish-*` :

```powershell
$env:JFROG_URL = "http://localhost:8082/artifactory"
$env:JFROG_USERNAME = Read-Host "JFrog username"
$secureToken = Read-Host "JFrog identity token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $env:JFROG_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
```

Expected: les trois variables sont présentes dans le processus courant ; aucune valeur réelle
n’est écrite dans Git, l’historique du shell ou les logs.

- [ ] **Step 8: Publier un snapshot unique**

```powershell
$snapshotVersion = "0.1.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())-SNAPSHOT"
make artifacts-publish-snapshot VERSION=$snapshotVersion
Remove-Item Env:JFROG_TOKEN
```

Expected: déploiement dans snapshots, token absent des logs.

- [ ] **Step 9: Commit conditionnel**

```powershell
git add -- backend/pom.xml infrastructure/jfrog/settings.xml.example Makefile
git commit -m "build: publish Maven artifacts to JFrog"
```

Exécuter seulement avec autorisation.

### Task 4: Promotion immuable et résolution à cache vierge

> **Correction d’exécution :** l’API `/api/copy` décrite dans le plan initial exige Artifactory
> Pro. L’implémentation finale dans `infrastructure/jfrog/promote.sh` utilise l’API de déploiement
> par checksum disponible en OSS, vérifie séparément le POM et le JAR et reprend uniquement un état
> partiel dont les checksums sont identiques. Le bloc historique de l’étape 2 ci-dessous est
> conservé comme trace du test rouge, pas comme commande à exécuter.

**Files:**
- Create: `infrastructure/jfrog/promote.sh`
- Modify: `docker-compose.devops.yml`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `com/molo/devops-store-backend/X.Y.Z`, admin token et virtual Task 2.
- Produces: `artifactory-promote`, `artifactory-resolve`, `artifacts-promote`, `artifacts-resolve`.

- [ ] **Step 1: Observer les interfaces absentes**

```powershell
make artifacts-promote VERSION=0.1.0
make artifacts-resolve VERSION=0.1.0
```

Expected: deux cibles inconnues.

- [ ] **Step 2: Écrire le script de promotion**

```sh
#!/bin/sh
set -eu

: "${JFROG_INTERNAL_URL:?JFROG_INTERNAL_URL is required}"
: "${JFROG_ADMIN_TOKEN:?JFROG_ADMIN_TOKEN is required}"
: "${VERSION:?VERSION=X.Y.Z is required}"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
    echo 'VERSION must match X.Y.Z and must not be a snapshot' >&2
    exit 1
}

path="com/molo/devops-store-backend/${VERSION}"
auth="Authorization: Bearer ${JFROG_ADMIN_TOKEN}"
status() {
    curl --silent --show-error --output /tmp/jfrog-response --write-out '%{http_code}' \
        --header "$auth" "$1"
}

candidate_code=$(status "${JFROG_INTERNAL_URL}/api/storage/devops-store-candidates-local/${path}")
[ "$candidate_code" = 200 ] || { echo "Candidate ${VERSION} does not exist" >&2; exit 1; }
release_code=$(status "${JFROG_INTERNAL_URL}/api/storage/devops-store-releases-local/${path}")
[ "$release_code" = 404 ] || { echo "Release ${VERSION} already exists" >&2; exit 1; }

copy_code=$(curl --silent --show-error --output /tmp/jfrog-response --write-out '%{http_code}' \
    --request POST --header "$auth" \
    "${JFROG_INTERNAL_URL}/api/copy/devops-store-candidates-local/${path}?to=/devops-store-releases-local/${path}&dry=0&failFast=1")
[ "$copy_code" = 200 ] || { echo "Promotion ${VERSION} failed: HTTP ${copy_code}" >&2; exit 1; }
release_code=$(status "${JFROG_INTERNAL_URL}/api/storage/devops-store-releases-local/${path}")
[ "$release_code" = 200 ] || { echo "Promoted release ${VERSION} cannot be verified" >&2; exit 1; }
echo "Release ${VERSION} promoted"
```

- [ ] **Step 3: Tester le rejet snapshot avant réseau**

```powershell
docker run --rm --entrypoint /bin/sh `
  -e JFROG_INTERNAL_URL=http://invalid `
  -e JFROG_ADMIN_TOKEN=validation-only `
  -e VERSION=0.1.0-SNAPSHOT `
  -v "${PWD}/infrastructure/jfrog/promote.sh:/opt/jfrog/promote.sh:ro" `
  curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6 `
  /opt/jfrog/promote.sh
```

Expected: FAIL `must not be a snapshot` avant réseau.

- [ ] **Step 4: Ajouter le helper de promotion**

```yaml
  artifactory-promote:
    profiles: [artifacts-tools]
    image: curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6
    environment:
      JFROG_INTERNAL_URL: http://artifactory:8082/artifactory
      JFROG_ADMIN_TOKEN: ${JFROG_ADMIN_TOKEN:-}
      VERSION: ${VERSION:-}
    volumes:
      - ./infrastructure/jfrog/promote.sh:/opt/jfrog/promote.sh:ro
    entrypoint: [/bin/sh, /opt/jfrog/promote.sh]
    depends_on:
      artifactory:
        condition: service_healthy
    networks: [artifacts]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
```

- [ ] **Step 5: Ajouter le consommateur Maven éphémère**

```yaml
  artifactory-resolve:
    profiles: [artifacts-tools]
    image: maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2
    environment:
      JFROG_URL: http://artifactory:8082/artifactory
      JFROG_USERNAME: ${JFROG_USERNAME:-}
      JFROG_TOKEN: ${JFROG_TOKEN:-}
      VERSION: ${VERSION:-}
    volumes:
      - ./infrastructure/jfrog/settings.xml.example:/opt/jfrog/settings.xml:ro
    working_dir: /tmp/consumer
    entrypoint:
      - /bin/sh
      - -ec
      - >-
        test -n "$$VERSION" || { echo 'VERSION is required' >&2; exit 1; };
        test -n "$$JFROG_USERNAME" || { echo 'JFROG_USERNAME is required' >&2; exit 1; };
        test -n "$$JFROG_TOKEN" || { echo 'JFROG_TOKEN is required' >&2; exit 1; };
        mvn -B -s /opt/jfrog/settings.xml
        -Dmaven.repo.local=/tmp/m2/repository dependency:get
        -Dartifact=com.molo:devops-store-backend:$$VERSION -Dtransitive=false
    depends_on:
      artifactory:
        condition: service_healthy
    networks: [artifacts]
    security_opt: [no-new-privileges:true]
```

- [ ] **Step 6: Ajouter les cibles Make**

```make
artifacts-promote:
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z is required" >&2; exit 1; }
	VERSION=$(VERSION) $(DEVOPS_COMPOSE) run --rm artifactory-promote

artifacts-resolve:
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z or X.Y.Z-SNAPSHOT is required" >&2; exit 1; }
	VERSION=$(VERSION) $(DEVOPS_COMPOSE) run --rm artifactory-resolve
```

- [ ] **Step 7: Prouver le parcours réel**

```powershell
make artifacts-resolve VERSION=$snapshotVersion
$releaseVersion = "0.1.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
make artifacts-publish-candidate VERSION=$releaseVersion
make artifacts-resolve VERSION=$releaseVersion
```

Expected: snapshot résolu ; candidate publiée ; résolution candidate FAIL avant promotion.

```powershell
make artifacts-promote VERSION=$releaseVersion
make artifacts-resolve VERSION=$releaseVersion
make artifacts-promote VERSION=$releaseVersion
```

Expected: promotion et résolution réussies ; second passage FAIL `already exists`.

- [ ] **Step 8: Commit conditionnel**

```powershell
git add -- infrastructure/jfrog/promote.sh docker-compose.devops.yml Makefile
git commit -m "feat: promote Maven release candidates"
```

Exécuter seulement avec autorisation.

---

### Task 5: Publication conditionnelle dans la CI backend

**Files:**
- Modify: `.github/workflows/backend-ci.yml:3-75`
- Modify: `docs/devops/github-actions.md`

**Interfaces:**
- Consumes: `verify`, `vars.JFROG_URL`, `vars.JFROG_USERNAME`, `secrets.JFROG_TOKEN`.
- Produces: `publish` désactivé sur PR/config absente, snapshot main, candidate tag `vX.Y.Z`.

- [ ] **Step 1: Assertions rouges**

```powershell
rg -n "tags:|name: Publish backend artifact|JFROG_TOKEN|ARTIFACT_VERSION" .github/workflows/backend-ci.yml
```

Expected: job et variables absents.

- [ ] **Step 2: Étendre les déclencheurs**

Sous `push`, ajouter `tags: ['v*']`. Ajouter `infrastructure/jfrog/**` aux listes `paths` des
événements `push` et `pull_request` qui déclenchent le workflow ; ne modifier aucun autre filtre
de pull request.

- [ ] **Step 3: Ajouter le job `publish`**

```yaml
  publish:
    name: Publish backend artifact
    if: github.event_name == 'push'
    needs: verify
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    defaults:
      run:
        shell: bash
    steps:
      - name: Detect JFrog configuration
        id: jfrog-config
        env:
          JFROG_URL: ${{ vars.JFROG_URL }}
          JFROG_USERNAME: ${{ vars.JFROG_USERNAME }}
          JFROG_TOKEN: ${{ secrets.JFROG_TOKEN }}
        run: |
          if [[ -n "$JFROG_URL" && -n "$JFROG_USERNAME" && -n "$JFROG_TOKEN" ]]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
          else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "JFrog publication is disabled: configure JFROG_URL, JFROG_USERNAME and JFROG_TOKEN."
          fi

      - name: Check out repository
        if: steps.jfrog-config.outputs.enabled == 'true'
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Java
        if: steps.jfrog-config.outputs.enabled == 'true'
        uses: actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5.7.0
        with:
          distribution: temurin
          java-version: '25'
          cache: maven
          cache-dependency-path: backend/pom.xml

      - name: Select Maven version
        if: steps.jfrog-config.outputs.enabled == 'true'
        env:
          REF_NAME: ${{ github.ref_name }}
          REF_TYPE: ${{ github.ref_type }}
        run: |
          if [[ "$REF_TYPE" == "tag" ]]; then
            [[ "$REF_NAME" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
              echo "Release tags must match vX.Y.Z" >&2
              exit 1
            }
            version="${REF_NAME#v}"
          else
            version="0.1.0-SNAPSHOT"
          fi
          echo "ARTIFACT_VERSION=$version" >> "$GITHUB_ENV"

      - name: Publish Maven artifact
        if: steps.jfrog-config.outputs.enabled == 'true'
        working-directory: backend
        env:
          JFROG_URL: ${{ vars.JFROG_URL }}
          JFROG_USERNAME: ${{ vars.JFROG_USERNAME }}
          JFROG_TOKEN: ${{ secrets.JFROG_TOKEN }}
        run: >-
          ./mvnw -B -DskipTests
          -Drevision="$ARTIFACT_VERSION"
          -s ../infrastructure/jfrog/settings.xml.example
          deploy
```

- [ ] **Step 4: Vérifier sécurité et syntaxe**

```powershell
rg -n "if: github.event_name == 'push'|needs: verify|persist-credentials: false|secrets.JFROG_TOKEN|Release tags must match" .github/workflows/backend-ci.yml
make ci-lint
```

Expected: invariants présents et actionlint vert.

- [ ] **Step 5: Documenter la CI**

Dans `docs/devops/github-actions.md`, documenter main/tag, dépendance `verify`, secrets optionnels,
absence de publication PR et absence de promotion automatique.

- [ ] **Step 6: Commit conditionnel**

```powershell
git add -- .github/workflows/backend-ci.yml docs/devops/github-actions.md
git commit -m "ci: publish Maven artifacts to JFrog"
```

Exécuter seulement avec autorisation.


---

### Task 6: Documentation opérationnelle et état du projet

**Files:**
- Create: `docs/devops/jfrog-artifactory.md`
- Modify: `README.md:8-16`
- Modify: `README.md:75-120`
- Modify: `docs/README.md`
- Modify: `AGENTS.md:15-75`
- Modify: `AGENTS.md:130-230`
- Modify: `docs/IMPLEMENTATION_PLAN.md:36-95`
- Modify: `docs/IMPLEMENTATION_PLAN.md:620-658`

**Interfaces:**
- Consumes: commandes et preuves réelles Tasks 1–5.
- Produces: guide copiable, index, état exact, limites OSS/JCR et transition Terraform.

- [ ] **Step 1: Observer l’absence du guide**

```powershell
Test-Path docs/devops/jfrog-artifactory.md
rg -n "artifacts-bootstrap|artifacts-promote|registry-config" README.md docs/README.md AGENTS.md
```

Expected: guide absent et commandes non documentées.

- [ ] **Step 2: Créer le guide avec une structure fixe**

```markdown
# JFrog Artifactory

## Périmètre livré
## Architecture locale
## Prérequis et ressources
## Variables et secrets
## Premier démarrage sécurisé
## Topologie Maven
## Bootstrap idempotent
## Publication snapshot et candidate
## Promotion et résolution
## GitHub Actions
## Profil JCR optionnel
## Passage à Terraform
## Dépannage
## Mise à jour sûre
```

Inclure les commandes PowerShell/Make réelles, cinq repositories, deux URLs, digests, permissions
minimales et distinction GitHub/code, Actions/exécution, Artifactory/JAR, JCR/images.

- [ ] **Step 3: Mettre à jour README et index**

Après acceptance Maven, annoncer Artifactory dans `README.md`, ajouter `http://localhost:8082`, les
cibles principales et le lien du guide. Décrire JCR comme profil optionnel non validé en runtime si
tel est le résultat. Ajouter le guide dans `docs/README.md` sans déplacer Terraform hors planifié.

- [ ] **Step 4: Actualiser AGENTS.md**

Ajouter images/versions, variables, cibles réellement créées, RAM, onboarding, séparation OSS/JCR
et règle de publication. Ne déclarer JCR opérationnel que si son runtime a réellement été validé.

- [ ] **Step 5: Actualiser le plan directeur avec preuves**

Dans `docs/IMPLEMENTATION_PLAN.md` : version `7.161.20`, PostgreSQL `17.10`, repository candidates,
cases prouvées localement, commandes/résultats, distinction CI configurée/exécutée et import des
cinq repositories prévu en phase 10.

- [ ] **Step 6: Contrôler liens et affirmations**

```powershell
rg -n "JFrog Artifactory|Artifactory OSS|JCR|artifacts-bootstrap|artifacts-promote|Terraform" README.md docs/README.md AGENTS.md docs/devops/jfrog-artifactory.md docs/IMPLEMENTATION_PLAN.md
rg -n -i "npm publish|Artifactory OSS.*Docker registry|Xray inclus|release bundle" README.md docs AGENTS.md
```

Expected: informations attendues présentes ; aucune affirmation fausse. Les fonctions hors
périmètre apparaissent uniquement comme exclusions.

- [ ] **Step 7: Commit conditionnel**

```powershell
git add -- README.md docs/README.md AGENTS.md docs/devops/jfrog-artifactory.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document JFrog artifact management"
```

Exécuter seulement avec autorisation.

---

### Task 7: Acceptance gate, revue et clôture

**Files:**
- Verify: all files in Tasks 1–6
- Modify only if validation reveals a scoped defect.

**Interfaces:**
- Consumes: implémentation, secrets locaux, Docker sain et licence AIStor.
- Produces: preuves Compose/Maven/backend/CI statique/sécurité, diff revu et état exact.

- [ ] **Step 1: Revalider Compose**

```powershell
make artifacts-config
make registry-config
docker compose -f docker-compose.devops.yml --profile artifacts --profile artifacts-tools config --quiet
```

Expected: trois résolutions vertes, sans token dans les sorties conservées.

- [ ] **Step 2: Revalider OSS et bootstrap**

```powershell
make artifacts-up
make artifacts-status
curl.exe --fail http://localhost:8082/router/api/v1/system/readiness
make artifacts-bootstrap
make artifacts-bootstrap
```

Expected: services sains, readiness 200, bootstrap idempotent.

- [ ] **Step 3: Rejouer le parcours Maven complet**

```powershell
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$snapshotVersion = "0.1.$suffix-SNAPSHOT"
$releaseVersion = "0.1.$suffix"
make artifacts-publish-snapshot VERSION=$snapshotVersion
make artifacts-resolve VERSION=$snapshotVersion
make artifacts-publish-candidate VERSION=$releaseVersion
make artifacts-resolve VERSION=$releaseVersion
if ($LASTEXITCODE -eq 0) { throw 'Candidate unexpectedly resolved before promotion' }
make artifacts-promote VERSION=$releaseVersion
make artifacts-resolve VERSION=$releaseVersion
make artifacts-promote VERSION=$releaseVersion
if ($LASTEXITCODE -eq 0) { throw 'Second promotion unexpectedly succeeded' }
```

Expected: snapshot publié/résolu ; candidate invisible ; promotion/résolution vertes ; second
passage refusé.

- [ ] **Step 4: Rejouer backend, workflow et sécurité**

```powershell
Set-Location backend
./mvnw.cmd -B clean verify
Set-Location ..
make ci-lint
make trivy-config
git diff --check
```

Expected: backend, actionlint, Trivy et whitespace verts.

- [ ] **Step 5: Vérifier secrets et artefacts générés**

```powershell
git status --short
git diff -- .env.example docker-compose.devops.yml infrastructure/jfrog .github/workflows/backend-ci.yml backend/pom.xml
rg -n --hidden -g '!minio.license' -g '!.git/**' -g '!backend/target/**' -g '!frontend/node_modules/**' "JFROG_ADMIN_TOKEN=.+|JFROG_TOKEN=.+|ARTIFACTORY_DB_PASSWORD=.+|JCR_DB_PASSWORD=.+" .
```

Expected: uniquement valeurs vides d’exemple ; aucun `.env`, token, mot de passe, target ou cache
nouveau suivi.

- [ ] **Step 6: Demander une revue indépendante**

Invoquer `superpowers:requesting-code-review`. Corriger uniquement les écarts confirmés, puis
rejouer les validations affectées et `git diff --check`.

- [ ] **Step 7: Arrêter sans supprimer les données**

```powershell
make artifacts-down
docker compose -f docker-compose.devops.yml --profile artifacts ps
```

Expected: conteneurs arrêtés, volumes préservés. Ne pas exécuter `artifacts-reset`.

- [ ] **Step 8: Réconcilier documentation et preuves**

Cocher uniquement Compose, OSS, bootstrap, snapshot, candidate, promotion, résolution, backend,
actionlint et Trivy réellement validés. Laisser JCR runtime et CI distante non cochés s’ils n’ont
pas été exécutés.

- [ ] **Step 9: Vérification finale avant annonce**

Invoquer `superpowers:verification-before-completion`, puis :

```powershell
git diff --check
git status -sb
git diff --stat
git diff --name-only
```

Expected: diff limité à la phase 9, aucune erreur de whitespace ni changement utilisateur hors
périmètre.

- [ ] **Step 10: Commit final conditionnel**

Seulement avec autorisation explicite et s’il reste des changements non commités :

```powershell
git add -- .env.example .github/workflows/backend-ci.yml AGENTS.md Makefile README.md backend/pom.xml docker-compose.devops.yml docs infrastructure/jfrog
git commit -m "feat: add JFrog artifact management"
```

Ne jamais pousser ni créer une PR sans autorisation séparée.

---
