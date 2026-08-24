# SonarQube Quality Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fournir deux analyses SonarQube reproductibles pour le backend Java 25 et le frontend TypeScript 6, localement et dans une CI conditionnelle, avec tests, couverture et quality gates.

**Architecture:** Une stack Compose `quality` démarre SonarQube Community Build 26.7 et sa base PostgreSQL dédiée. Le backend utilise SonarScanner for Maven et le frontend SonarScanner for NPM ; chaque application possède sa propre clé et son propre quality gate, tandis qu’un workflow dédié ne s’active que pour une instance SonarQube externe configurée.

**Tech Stack:** SonarQube Community Build 26.7.0.124771, PostgreSQL 18.4, Docker Compose 5.1, SonarScanner for Maven 5.5.0.6356, `@sonar/scan` 5.0.0, `vitest-sonar-reporter` 3.0.0, Java 25, Maven 3.9.13, Node.js 24.18.0, npm 11.16.0, Angular 22.1 et GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-sonarqube-quality-design.md`

**État d’exécution :** implémentation et acceptance gate terminées le 24 août 2026. Les étapes de
commit et de push restent volontairement non exécutées faute d’autorisation explicite.

## Global Constraints

- Utiliser `sonarqube:26.7.0.124771-community@sha256:d4899d380ad9d7b63ebaa751e047f5a4f064f8902cdf7c1a3c3c96f7d71600ed` pour le premier smoke scan.
- Réutiliser `postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` pour la base SonarQube.
- Verrouiller SonarScanner for Maven à `5.5.0.6356`, `@sonar/scan` à `5.0.0` et `vitest-sonar-reporter` à `3.0.0`.
- Les builds backend et scans Maven s’exécutent avec Java 25 ; les commandes frontend utilisent Node 24.18.0 et npm 11.16.0.
- Ne jamais versionner la valeur de `SONAR_DB_PASSWORD`, `SONAR_TOKEN`, un mot de passe administrateur ou une URL privée.
- Community Build ne reçoit que la branche principale : aucune analyse Sonar n’est lancée sur Pull Request.
- Les tests TypeScript ne sont jamais exclus pour contourner une incompatibilité du moteur SonarJS.
- `quality-down` préserve les volumes ; seule une cible explicitement nommée `quality-reset` peut supprimer les données SonarQube locales.
- Ne créer aucun commit ni push sans autorisation explicite. Les étapes de commit ci-dessous restent conditionnelles.

---

### Task 0: Baseline du worktree

**Files:**
- No production files modified.

**Interfaces:**
- Consumes: Java 25, Docker, `MINIO_LICENSE_FILE`, Node.js 24.18.0 et npm 11.16.0.
- Produces: une baseline backend/frontend verte qui rend tout échec ultérieur attribuable à la phase 7.

- [x] **Step 1: Confirmer l’isolation et le périmètre initial**

Run :

```powershell
git branch --show-current
git status -sb
```

Expected: branche `codex/phase-7-sonarqube`; seuls la spécification et le plan SonarQube sont
nouveaux, sans changement applicatif.

- [x] **Step 2: Vérifier les prérequis backend sans lire la licence**

Run :

```powershell
java --version
docker version
if (-not (Test-Path -LiteralPath $env:MINIO_LICENSE_FILE -PathType Leaf)) {
  throw 'MINIO_LICENSE_FILE must reference a readable local license'
}
```

Expected: Java 25, Docker disponible et chemin de licence lisible. Si Java 25 manque, arrêter la
baseline backend et signaler précisément le prérequis au lieu de modifier le code.

- [x] **Step 3: Exécuter la baseline backend**

Run depuis `backend/` :

```powershell
.\mvnw.cmd clean verify
```

Expected: tous les tests et le package passent ; JaCoCo XML est généré.

- [x] **Step 4: Installer et valider la baseline frontend**

Run depuis `frontend/` :

```powershell
npm ci
npm run lint
npm run test:ci
npm run build
```

Expected: installation déterministe, lint, tests, couverture et build verts.

- [x] **Step 5: Consigner la baseline**

Ajouter les nombres de tests, durées et éventuels avertissements non bloquants dans `progress.md`.
Ne modifier aucun fichier suivi pour résoudre un échec de baseline sans diagnostic séparé.

---

### Task 1: Stack Compose SonarQube locale

**Files:**
- Create: `docker-compose.devops.yml`
- Modify: `.env.example`
- Modify: `Makefile`

**Interfaces:**
- Consumes: Docker Compose, la variable obligatoire `SONAR_DB_PASSWORD` et le port optionnel `SONAR_PORT`.
- Produces: les services `sonarqube-db` et `sonarqube`, le réseau `quality`, les volumes Sonar et les cibles Make `quality-config`, `quality-up`, `quality-down`, `quality-status`, `quality-logs`, `quality-reset`.

- [ ] **Step 1: Observer l’échec avant création du manifeste**

Run depuis la racine du worktree :

```powershell
docker compose -f docker-compose.devops.yml --profile quality config --quiet
```

Expected: FAIL car `docker-compose.devops.yml` n’existe pas.

- [ ] **Step 2: Créer le manifeste Compose de qualité**

Créer `docker-compose.devops.yml` avec ce contenu :

```yaml
name: devops-store-devops

services:
  sonarqube-db:
    profiles: [quality]
    image: postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
    environment:
      POSTGRES_DB: ${SONAR_DB_NAME:-sonarqube}
      POSTGRES_USER: ${SONAR_DB_USERNAME:-sonarqube}
      POSTGRES_PASSWORD: ${SONAR_DB_PASSWORD:?Set SONAR_DB_PASSWORD outside Git}
    volumes:
      - sonarqube-postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s
    networks:
      - quality
    restart: unless-stopped
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true
    cpus: 0.5
    mem_limit: 512m
    pids_limit: 200

  sonarqube:
    profiles: [quality]
    image: sonarqube:26.7.0.124771-community@sha256:d4899d380ad9d7b63ebaa751e047f5a4f064f8902cdf7c1a3c3c96f7d71600ed
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://sonarqube-db:5432/${SONAR_DB_NAME:-sonarqube}
      SONAR_JDBC_USERNAME: ${SONAR_DB_USERNAME:-sonarqube}
      SONAR_JDBC_PASSWORD: ${SONAR_DB_PASSWORD:?Set SONAR_DB_PASSWORD outside Git}
    ports:
      - "127.0.0.1:${SONAR_PORT:-9000}:9000"
    volumes:
      - sonarqube-data:/opt/sonarqube/data
      - sonarqube-extensions:/opt/sonarqube/extensions
      - sonarqube-logs:/opt/sonarqube/logs
      - sonarqube-temp:/opt/sonarqube/temp
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          curl --fail --silent http://localhost:9000/api/system/status
          | grep --quiet '"status":"UP"'
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 60s
    depends_on:
      sonarqube-db:
        condition: service_healthy
    networks:
      - quality
    restart: unless-stopped
    stop_grace_period: 60s
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cpus: 2.0
    mem_limit: 3g
    pids_limit: 500

networks:
  quality:
    driver: bridge

volumes:
  sonarqube-postgres-data:
  sonarqube-data:
  sonarqube-extensions:
  sonarqube-logs:
  sonarqube-temp:
```

- [ ] **Step 3: Ajouter les variables d’exemple sans secret**

Ajouter à `.env.example` :

```dotenv
# SonarQube local: keep the password outside Git
SONAR_PORT=9000
SONAR_DB_NAME=sonarqube
SONAR_DB_USERNAME=sonarqube
SONAR_DB_PASSWORD=
```

Ne pas ajouter `SONAR_TOKEN` à ce fichier.

- [ ] **Step 4: Ajouter les cibles Make d’exploitation**

Ajouter près des variables du `Makefile` :

```make
DEVOPS_COMPOSE ?= docker compose -f docker-compose.devops.yml
```

Étendre `.PHONY` avec les six cibles qualité, puis ajouter :

```make
quality-config: ## Validate the SonarQube Compose profile
	$(DEVOPS_COMPOSE) --profile quality config --quiet

quality-up: ## Start SonarQube and its PostgreSQL database
	$(DEVOPS_COMPOSE) --profile quality up -d --wait

quality-down: ## Stop SonarQube while preserving quality data
	$(DEVOPS_COMPOSE) --profile quality down

quality-status: ## Show SonarQube container and health status
	$(DEVOPS_COMPOSE) --profile quality ps

quality-logs: ## Follow SonarQube and database logs
	$(DEVOPS_COMPOSE) --profile quality logs --follow --tail=200

quality-reset: ## Delete the local SonarQube stack and its volumes
	$(DEVOPS_COMPOSE) --profile quality down --volumes
```

- [ ] **Step 5: Valider le manifeste sans écrire de secret**

Run :

```powershell
& {
  $env:SONAR_DB_PASSWORD = 'validation-only'
  docker compose -f docker-compose.devops.yml --profile quality config --quiet
}
```

Expected: PASS, aucune valeur `validation-only` dans un fichier suivi.

- [ ] **Step 6: Contrôler le diff de la tâche**

Run :

```powershell
git diff --check
git diff -- docker-compose.devops.yml .env.example Makefile
```

Expected: aucun problème de whitespace ; uniquement la stack et les commandes prévues.

- [ ] **Step 7: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- docker-compose.devops.yml .env.example Makefile
git commit -m "feat: add local SonarQube stack"
```

---

### Task 2: Analyse backend avec SonarScanner for Maven

**Files:**
- Modify: `backend/pom.xml`

**Interfaces:**
- Consumes: `backend/target/surefire-reports`, `backend/target/site/jacoco/jacoco.xml`, `SONAR_HOST_URL` et `SONAR_TOKEN`.
- Produces: le projet `devops-store-backend`, un scan Maven verrouillé et un quality gate attendu au plus 300 secondes.

- [ ] **Step 1: Vérifier que le scanner n’est pas encore configuré**

Run :

```powershell
rg "sonar-maven-plugin|sonar.projectKey|sonar.coverage.jacoco" backend/pom.xml
```

Expected: aucune correspondance.

- [ ] **Step 2: Ajouter les propriétés Sonar backend**

Ajouter sous les propriétés existantes du `pom.xml` :

```xml
<sonar-maven-plugin.version>5.5.0.6356</sonar-maven-plugin.version>
<sonar.projectKey>devops-store-backend</sonar.projectKey>
<sonar.projectName>DevOps Store Backend</sonar.projectName>
<sonar.sourceEncoding>UTF-8</sonar.sourceEncoding>
<sonar.junit.reportPaths>${project.build.directory}/surefire-reports</sonar.junit.reportPaths>
<sonar.coverage.jacoco.xmlReportPaths>${project.build.directory}/site/jacoco/jacoco.xml</sonar.coverage.jacoco.xmlReportPaths>
<sonar.qualitygate.wait>true</sonar.qualitygate.wait>
<sonar.qualitygate.timeout>300</sonar.qualitygate.timeout>
```

- [ ] **Step 3: Verrouiller le plugin Maven sans exécution implicite**

Ajouter dans `build/plugins` :

```xml
<plugin>
    <groupId>org.sonarsource.scanner.maven</groupId>
    <artifactId>sonar-maven-plugin</artifactId>
    <version>${sonar-maven-plugin.version}</version>
</plugin>
```

Le plugin ne doit posséder aucune `execution` liée au cycle Maven : le scan reste explicite.

- [ ] **Step 4: Vérifier le POM effectif**

Run depuis `backend/` avec Java 25 :

```powershell
.\mvnw.cmd -q help:effective-pom -Doutput=target/effective-pom.xml
rg "5.5.0.6356|devops-store-backend|jacoco.xml" target/effective-pom.xml
```

Expected: les trois valeurs sont présentes et Maven termine avec le code 0.

- [ ] **Step 5: Vérifier que la construction normale reste inchangée**

Run avec Docker accessible et `MINIO_LICENSE_FILE` valide :

```powershell
.\mvnw.cmd clean verify
```

Expected: tests verts, `target/site/jacoco/jacoco.xml` et `target/surefire-reports` présents ; aucun scan n’est lancé sans objectif Sonar explicite.

- [ ] **Step 6: Contrôler le diff de la tâche**

Run :

```powershell
git diff --check
git diff -- backend/pom.xml
```

- [ ] **Step 7: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- backend/pom.xml
git commit -m "build: configure backend Sonar analysis"
```

---

### Task 3: Rapports Vitest et analyse frontend

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/angular.json`
- Create: `frontend/sonar-project.properties`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `frontend/coverage/frontend/lcov.info`, `frontend/sonar-report.xml`, `SONAR_HOST_URL` et `SONAR_TOKEN`.
- Produces: le projet `devops-store-frontend`, le script npm `sonar` et un rapport Generic Test Execution Vitest.

- [ ] **Step 1: Observer l’absence du rapport de tests Sonar**

Run depuis `frontend/` :

```powershell
npm ci
npm run test:ci
if (Test-Path 'sonar-report.xml') { throw 'Unexpected Sonar report before reporter setup' }
```

Expected: tests verts, LCOV présent, `sonar-report.xml` absent.

- [ ] **Step 2: Installer les outils verrouillés**

Run depuis `frontend/` :

```powershell
npm install --save-dev --save-exact @sonar/scan@5.0.0 vitest-sonar-reporter@3.0.0
```

Expected: `package.json` et `package-lock.json` enregistrent exactement les versions 5.0.0 et 3.0.0.

- [ ] **Step 3: Ajouter le script scanner NPM**

Ajouter dans `scripts` de `frontend/package.json` :

```json
"sonar": "sonar-scanner-npm"
```

- [ ] **Step 4: Configurer le reporter Generic Test Execution**

Ajouter dans `projects.frontend.architect.test.options` de `frontend/angular.json` :

```json
"reporters": [
  "default",
  ["vitest-sonar-reporter", { "outputFile": "sonar-report.xml" }]
]
```

Ajouter à `.gitignore` :

```gitignore
frontend/sonar-report.xml
```

- [ ] **Step 5: Créer la configuration du projet frontend**

Créer `frontend/sonar-project.properties` :

```properties
sonar.projectKey=devops-store-frontend
sonar.projectName=DevOps Store Frontend
sonar.sourceEncoding=UTF-8
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=src/**/*.spec.ts
sonar.exclusions=src/**/*.spec.ts
sonar.typescript.tsconfigPaths=tsconfig.app.json,tsconfig.spec.json
sonar.javascript.lcov.reportPaths=coverage/frontend/lcov.info
sonar.testExecutionReportPaths=sonar-report.xml
sonar.qualitygate.wait=true
sonar.qualitygate.timeout=300
```

- [ ] **Step 6: Générer et valider les deux rapports frontend**

Run depuis `frontend/` :

```powershell
npm run lint
npm run test:ci
npm run build
if (-not (Test-Path 'coverage/frontend/lcov.info')) { throw 'LCOV report missing' }
if (-not (Test-Path 'sonar-report.xml')) { throw 'Sonar test report missing' }
Select-String -Path 'sonar-report.xml' -Pattern '<testExecutions version="1">'
```

Expected: lint, tests et build verts ; les deux rapports existent ; le XML utilise le format Sonar générique.

- [ ] **Step 7: Vérifier les versions et l’intégrité du lockfile**

Run :

```powershell
npm ci
npm ls @sonar/scan vitest-sonar-reporter --depth=0
```

Expected: `@sonar/scan@5.0.0` et `vitest-sonar-reporter@3.0.0`, sans dépendance invalide.

- [ ] **Step 8: Contrôler le diff de la tâche**

Run :

```powershell
git diff --check
git diff -- frontend/package.json frontend/package-lock.json frontend/angular.json frontend/sonar-project.properties .gitignore
```

- [ ] **Step 9: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- frontend/package.json frontend/package-lock.json frontend/angular.json frontend/sonar-project.properties .gitignore
git commit -m "build: configure frontend Sonar analysis"
```

---

### Task 4: Workflow GitHub Actions conditionnel

**Files:**
- Create: `.github/workflows/quality.yml`

**Interfaces:**
- Consumes: `vars.SONAR_HOST_URL`, `secrets.SONAR_TOKEN`, `secrets.MINIO_LICENSE_B64`, les configurations des Tasks 2 et 3.
- Produces: deux jobs `backend-quality` et `frontend-quality`, limités à `main` et au lancement manuel.

- [ ] **Step 1: Observer l’absence du workflow**

Run :

```powershell
if (Test-Path '.github/workflows/quality.yml') { throw 'quality.yml already exists' }
```

Expected: PASS parce que le workflow est absent.

- [ ] **Step 2: Créer les déclencheurs, permissions et préflights**

Créer `.github/workflows/quality.yml` avec :

```yaml
name: Quality

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/**'
      - '.github/workflows/quality.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: quality-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend-quality:
    name: Analyze backend
    runs-on: ubuntu-24.04
    timeout-minutes: 40
    defaults:
      run:
        shell: bash
        working-directory: backend
    steps:
      - name: Detect SonarQube configuration
        id: sonar-config
        working-directory: .
        env:
          SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: |
          if [[ -n "$SONAR_HOST_URL" && -n "$SONAR_TOKEN" ]]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
          else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "SonarQube analysis is disabled: configure SONAR_HOST_URL and SONAR_TOKEN."
          fi

      - name: Check out repository
        if: steps.sonar-config.outputs.enabled == 'true'
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Java
        if: steps.sonar-config.outputs.enabled == 'true'
        uses: actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5.7.0
        with:
          distribution: temurin
          java-version: '25'
          cache: maven
          cache-dependency-path: backend/pom.xml

      - name: Prepare AIStor license
        if: steps.sonar-config.outputs.enabled == 'true'
        env:
          MINIO_LICENSE_B64: ${{ secrets.MINIO_LICENSE_B64 }}
        run: |
          if [[ -z "$MINIO_LICENSE_B64" ]]; then
            echo "MINIO_LICENSE_B64 must exist in Actions secrets" >&2
            exit 1
          fi
          license_path="$RUNNER_TEMP/minio.license"
          printf '%s' "$MINIO_LICENSE_B64" | base64 --decode > "$license_path"
          chmod 600 "$license_path"
          echo "MINIO_LICENSE_FILE=$license_path" >> "$GITHUB_ENV"

      - name: Verify and analyze backend
        if: steps.sonar-config.outputs.enabled == 'true'
        env:
          SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: >-
          ./mvnw -B clean verify
          org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar

      - name: Remove AIStor license
        if: ${{ always() && steps.sonar-config.outputs.enabled == 'true' }}
        run: rm -f "${MINIO_LICENSE_FILE:-$RUNNER_TEMP/minio.license}"

  frontend-quality:
    name: Analyze frontend
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    defaults:
      run:
        shell: bash
        working-directory: frontend
    steps:
      - name: Detect SonarQube configuration
        id: sonar-config
        working-directory: .
        env:
          SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: |
          if [[ -n "$SONAR_HOST_URL" && -n "$SONAR_TOKEN" ]]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
          else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "SonarQube analysis is disabled: configure SONAR_HOST_URL and SONAR_TOKEN."
          fi

      - name: Check out repository
        if: steps.sonar-config.outputs.enabled == 'true'
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Node.js
        if: steps.sonar-config.outputs.enabled == 'true'
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24.18.0
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        if: steps.sonar-config.outputs.enabled == 'true'
        run: npm ci

      - name: Verify frontend
        if: steps.sonar-config.outputs.enabled == 'true'
        run: npm run lint && npm run test:ci && npm run build

      - name: Analyze frontend
        if: steps.sonar-config.outputs.enabled == 'true'
        env:
          SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: npm run sonar
```

- [ ] **Step 3: Valider la syntaxe et les privilèges**

Run depuis la racine :

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
rg "permissions:|uses:.*@[0-9a-f]{40}|pull_request" .github/workflows/quality.yml
```

Expected: actionlint vert, `permissions: contents: read`, trois actions épinglées, aucune clé `pull_request`.

- [ ] **Step 4: Vérifier le chemin désactivé**

Relire les deux préflights et confirmer que l’absence de variable ou de secret produit
`enabled=false`, n’exécute ni checkout ni build et termine le workflow avec succès.

- [ ] **Step 5: Contrôler le diff de la tâche**

Run :

```powershell
git diff --check
git diff -- .github/workflows/quality.yml
```

- [ ] **Step 6: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- .github/workflows/quality.yml
git commit -m "ci: add conditional SonarQube analysis"
```

---

### Task 5: Commandes de scan et documentation

**Files:**
- Modify: `Makefile`
- Create: `docs/devops/sonarqube.md`
- Modify: `docs/devops/testing.md`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: toutes les commandes et capacités validées dans les Tasks 1 à 4.
- Produces: `sonar-backend`, `sonar-frontend`, `sonar`, une procédure locale copiables et un état documentaire exact.

- [ ] **Step 1: Observer l’absence du guide SonarQube**

Run :

```powershell
if (Test-Path 'docs/devops/sonarqube.md') { throw 'SonarQube guide already exists' }
```

Expected: PASS parce que le guide est absent.

- [ ] **Step 2: Ajouter les cibles de scan au Makefile**

Étendre `.PHONY` avec `sonar`, `sonar-backend` et `sonar-frontend`, puis ajouter :

```make
sonar: sonar-backend sonar-frontend ## Analyze backend and frontend with SonarQube

sonar-backend: ## Verify and analyze the backend with SonarQube
	cd backend && ./mvnw clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar

sonar-frontend: ## Verify and analyze the frontend with SonarQube
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build && npm run sonar
```

- [ ] **Step 3: Créer le guide SonarQube**

Créer `docs/devops/sonarqube.md` avec exactement ces sections et commandes :

```markdown
# SonarQube

## Architecture et limites
## Prérequis
## Premier démarrage
## Mot de passe administrateur et token local
## Analyse backend
## Analyse frontend
## Quality gates
## GitHub Actions
## Arrêt et nettoyage
## Dépannage
```

Le guide doit inclure :

```powershell
$env:SONAR_DB_PASSWORD = '<local-password>'
docker compose -f docker-compose.devops.yml --profile quality up -d --wait
curl.exe http://localhost:9000/api/system/status

$env:SONAR_HOST_URL = 'http://localhost:9000'
$env:SONAR_TOKEN = '<local-analysis-token>'

Set-Location backend
.\mvnw.cmd clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar

Set-Location ..\frontend
npm ci
npm run lint
npm run test:ci
npm run build
npm run sonar
```

Le guide explique que `SONAR_HOST_URL` est une variable GitHub, `SONAR_TOKEN` et
`MINIO_LICENSE_B64` sont des secrets, que Community Build n’analyse que `main`, que
`quality-down` préserve les données et que `quality-reset` les supprime définitivement.

- [ ] **Step 4: Mettre à jour l’index et la stratégie de test**

Dans `docs/README.md`, déplacer `devops/sonarqube.md` de la liste planifiée vers la table
`Disponible` et conserver un lien dans la section DevOps.

Dans `docs/devops/testing.md`, remplacer le futur « seront importés » par l’état validé et ajouter
`frontend/sonar-report.xml` à la liste des rapports uniquement après génération réelle réussie.

- [ ] **Step 5: Mettre à jour README, AGENTS et plan directeur après validation réelle**

Après la Task 6 seulement :

- mentionner SonarQube local comme disponible dans le bandeau d’état de `README.md` ;
- ajouter l’URL `http://localhost:9000` et le lien vers le guide ;
- déplacer SonarQube de « Cible planifiée » vers « Implémentée » dans `AGENTS.md` ;
- ajouter les variables Sonar et les commandes `quality-*`/`sonar*` réellement disponibles ;
- cocher les huit éléments d’implémentation et les trois critères de la phase 7 dans
  `docs/IMPLEMENTATION_PLAN.md` seulement si chaque preuve de la Task 6 est verte.

- [ ] **Step 6: Vérifier les liens, commandes et affirmations**

Run :

```powershell
rg "sonarqube.md|quality-up|quality-down|sonar-backend|SONAR_DB_PASSWORD" README.md AGENTS.md docs Makefile .env.example
git diff --check
```

Expected: chaque commande documentée existe ; aucun texte ne présente Trivy ou les analyses de PR comme disponibles.

- [ ] **Step 7: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- Makefile docs/devops/sonarqube.md docs/devops/testing.md docs/README.md README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document SonarQube quality analysis"
```

---

### Task 6: Smoke scans réels et acceptance gate

**Files:**
- Modify if compatibility requires it: `docker-compose.devops.yml`
- Modify if compatibility requires it: `docs/devops/sonarqube.md`
- Modify after proof: `README.md`
- Modify after proof: `AGENTS.md`
- Modify after proof: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: Java 25, Docker, au moins 4 Gio de RAM, une licence AIStor locale, les variables Sonar locales et les cinq premières tâches.
- Produces: deux analyses visibles, métriques tests/couverture, quality gates, preuve TypeScript 6 et état documentaire final.

- [ ] **Step 1: Vérifier les prérequis sans afficher de secret**

Run :

```powershell
java --version
docker version
docker compose version
if (-not (Test-Path -LiteralPath $env:MINIO_LICENSE_FILE -PathType Leaf)) {
  throw 'MINIO_LICENSE_FILE must reference a readable local license'
}
```

Expected: Java 25, Docker disponible, licence lisible. Si Java 25 est absent, arrêter et obtenir un
JDK 25 réel avant de continuer ; ne pas annoncer un scan backend complet.

- [ ] **Step 2: Démarrer la stack avec un mot de passe éphémère**

Run sans imprimer la valeur :

```powershell
$sonarDbPassword = [Convert]::ToBase64String(
  [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
$env:SONAR_DB_PASSWORD = $sonarDbPassword
docker compose -f docker-compose.devops.yml --profile quality up -d --wait
docker compose -f docker-compose.devops.yml --profile quality ps
(Invoke-RestMethod 'http://localhost:9000/api/system/status').status
```

Expected: deux conteneurs sains et statut `UP`.

- [ ] **Step 3: Sécuriser le compte initial et créer un token éphémère**

Utiliser l’API locale sans afficher le mot de passe ni le token :

```powershell
$sonarAdminPassword = [Convert]::ToBase64String(
  [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
$changePassword = @{
  Uri = 'http://localhost:9000/api/users/change_password'
  Method = 'Post'
  Authentication = 'Basic'
  Credential = [pscredential]::new('admin', (ConvertTo-SecureString 'admin' -AsPlainText -Force))
  Body = @{
    login = 'admin'
    previousPassword = 'admin'
    password = $sonarAdminPassword
  }
}
Invoke-RestMethod @changePassword | Out-Null

$adminCredential = [pscredential]::new(
  'admin',
  (ConvertTo-SecureString $sonarAdminPassword -AsPlainText -Force)
)
$tokenResponse = Invoke-RestMethod `
  -Uri 'http://localhost:9000/api/user_tokens/generate' `
  -Method Post `
  -Authentication Basic `
  -Credential $adminCredential `
  -Body @{ name = 'phase-7-smoke-scan'; type = 'GLOBAL_ANALYSIS_TOKEN' }
$env:SONAR_HOST_URL = 'http://localhost:9000'
$env:SONAR_TOKEN = $tokenResponse.token
```

Expected: aucun secret affiché ; le token reste uniquement en mémoire du processus PowerShell.

- [ ] **Step 4: Exécuter le scan backend Java 25**

Run depuis `backend/` :

```powershell
.\mvnw.cmd clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar
```

Expected: tests verts, analyse terminée, quality gate calculé, aucune erreur de parsing Java 25.

- [ ] **Step 5: Exécuter le scan frontend TypeScript 6**

Run depuis `frontend/` :

```powershell
npm ci
npm run lint
npm run test:ci
npm run build
npm run sonar
```

Expected: tests/build verts, analyse terminée, aucune erreur TypeScript 6.0.2, quality gate calculé.

- [ ] **Step 6: Vérifier mesures et quality gates par API**

Run pour les deux clés :

```powershell
$tokenAuthorization = [Convert]::ToBase64String(
  [Text.Encoding]::ASCII.GetBytes("$($env:SONAR_TOKEN):")
)
$tokenHeaders = @{ Authorization = "Basic $tokenAuthorization" }
foreach ($projectKey in 'devops-store-backend', 'devops-store-frontend') {
  $measures = Invoke-RestMethod `
    -Uri "http://localhost:9000/api/measures/component?component=$projectKey&metricKeys=coverage,tests,test_errors,test_failures" `
    -Headers $tokenHeaders
  $gate = Invoke-RestMethod `
    -Uri "http://localhost:9000/api/qualitygates/project_status?projectKey=$projectKey" `
    -Headers $tokenHeaders
  [pscustomobject]@{
    Project = $projectKey
    Measures = ($measures.component.measures.metric -join ',')
    Gate = $gate.projectStatus.status
  }
}
```

Expected: chaque projet expose `coverage` et `tests`; chaque gate possède un statut final `OK` ou
`ERROR`, jamais `NONE`. Un gate `ERROR` doit être traité comme un échec d’acceptation, pas masqué.

- [ ] **Step 7: Appliquer la procédure de compatibilité uniquement en cas d’échec TypeScript**

Si et seulement si les logs prouvent une incompatibilité SonarJS/TypeScript 6 :

1. relever la version SonarJS via l’API système ou l’UI ;
2. consulter les notes SonarSource officielles ;
3. sélectionner la première Community Build compatible ;
4. vérifier son manifeste AMD64/ARM64 et son digest ;
5. modifier l’image Compose et le guide ;
6. supprimer uniquement les conteneurs, préserver les volumes si la migration est supportée ;
7. rejouer les Steps 2 à 6 et toutes les validations de configuration.

Ne jamais résoudre cet échec avec `sonar.exclusions` sur le frontend.

- [ ] **Step 8: Révoquer le token et nettoyer les variables en mémoire**

Run dans un bloc `finally` même si un scan échoue :

```powershell
Invoke-RestMethod `
  -Uri 'http://localhost:9000/api/user_tokens/revoke' `
  -Method Post `
  -Authentication Basic `
  -Credential $adminCredential `
  -Body @{ name = 'phase-7-smoke-scan' } | Out-Null
Remove-Item Env:SONAR_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:SONAR_DB_PASSWORD -ErrorAction SilentlyContinue
$sonarDbPassword = $null
$sonarAdminPassword = $null
$tokenResponse = $null
$tokenAuthorization = $null
$tokenHeaders = $null
```

- [ ] **Step 9: Finaliser la documentation d’état**

Cocher la phase 7 et annoncer SonarQube comme disponible uniquement après les preuves des Steps 2 à
6. Noter explicitement si la validation distante GitHub Actions reste non exécutée faute d’instance
externe joignable.

- [ ] **Step 10: Exécuter la validation finale proportionnée**

Run :

```powershell
& {
  $env:SONAR_DB_PASSWORD = 'validation-only'
  docker compose -f docker-compose.devops.yml --profile quality config --quiet
}
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
Set-Location backend
.\mvnw.cmd clean verify
Set-Location ..\frontend
npm ci
npm run lint
npm run test:ci
npm run build
Set-Location ..
git diff --check
```

Expected: toutes les commandes vertes.

- [ ] **Step 11: Contrôler secrets et périmètre**

Run :

```powershell
git status -sb
git diff --stat
git grep -n -E "SONAR_TOKEN=.+|SONAR_DB_PASSWORD=.+|phase-7-smoke-scan.*token" -- . ':!docs/superpowers/plans/2026-08-24-sonarqube-quality.md'
```

Expected: aucun secret réel ; seulement les fichiers de la phase 7.

- [ ] **Step 12: Commit conditionnel**

Uniquement après autorisation explicite et revue du diff complet :

```powershell
git add -- docker-compose.devops.yml .env.example .gitignore Makefile backend/pom.xml frontend/package.json frontend/package-lock.json frontend/angular.json frontend/sonar-project.properties .github/workflows/quality.yml docs/devops/sonarqube.md docs/devops/testing.md docs/README.md README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-24-sonarqube-quality-design.md docs/superpowers/plans/2026-08-24-sonarqube-quality.md
git commit -m "feat: integrate SonarQube quality analysis"
```

Ne pas pousser sans autorisation explicite séparée si elle n’a pas été donnée.
