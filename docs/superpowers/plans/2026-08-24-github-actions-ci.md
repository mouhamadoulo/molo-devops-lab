# GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatiser les validations backend, frontend et Docker dans GitHub Actions avec des permissions minimales, des artefacts de diagnostic et des dépendances CI immuables.

**Architecture:** Trois workflows indépendants ciblent `main` et filtrent leurs chemins respectifs. Le backend reconstruit temporairement la licence AIStor depuis un secret, le frontend conserve sa couverture et Docker valide deux builds sans publication.

**Tech Stack:** GitHub Actions, Ubuntu 24.04, Java 25 Temurin, Maven Wrapper 3.9.13, Node.js 24.18.0, npm 11.16.0, Docker Buildx, Dependabot et actionlint 1.7.12.

**Spec:** `docs/superpowers/specs/2026-08-24-github-actions-ci-design.md`

## Global Constraints

- Exécuter le plan dans un workspace isolé créé ou vérifié par `superpowers:using-git-worktrees` ; branche suggérée `codex/phase-6-github-actions`.
- Ne jamais versionner, afficher ou copier dans un artefact la licence AIStor ou un autre secret.
- Utiliser `MINIO_LICENSE_B64` comme nom identique dans les secrets Actions et Dependabot.
- Limiter chaque workflow à `permissions: contents: read` et ne jamais utiliser `pull_request_target`.
- Épingler chaque `uses:` au SHA complet indiqué dans ce plan, avec la version lisible en commentaire.
- Utiliser `ubuntu-24.04`, Java 25 et Node.js 24.18.0 ; ne pas utiliser de label `latest`.
- Ne publier ni JAR, ni frontend, ni image Docker pendant cette phase.
- Ne pas ajouter Playwright, SonarQube, Trivy, Artifactory ou déploiement à ces workflows.
- Les étapes de commit, secret GitHub, push et Pull Request requièrent une autorisation utilisateur explicite au moment de l'exécution.
- Préserver les changements utilisateur hors périmètre et n'indexer que les fichiers listés dans chaque tâche.

## File Map

| Fichier | Responsabilité |
|---|---|
| `Makefile` | Fournir `ci-lint` avec l'image actionlint épinglée |
| `.github/workflows/backend-ci.yml` | Compiler, tester et conserver les rapports backend |
| `.github/workflows/frontend-ci.yml` | Linter, tester, couvrir et construire Angular |
| `.github/workflows/docker.yml` | Construire les images backend/frontend sans push |
| `.github/dependabot.yml` | Planifier les mises à jour Maven, npm, Actions et Docker |
| `frontend/package.json` | Faire de `test:ci` la commande locale/CI avec couverture |
| `docs/devops/github-actions.md` | Exploitation, secrets, artefacts et dépannage CI |
| `docs/README.md` | Rendre la documentation CI navigable |
| `README.md` | Exposer le point d'entrée CI sans allonger le démarrage |
| `docs/IMPLEMENTATION_PLAN.md` | Réconcilier la phase 6 avec GitHub Flow et les preuves réelles |

---

### Task 1: Local actionlint Contract

**Files:**
- Modify: `Makefile`

**Interfaces:**
- Consumes: Docker Desktop et le répertoire racine monté dans `/repo`.
- Produces: cible `ci-lint` et variable `ACTIONLINT_IMAGE` utilisées par les tâches suivantes.

- [ ] **Step 1: Verify the target is absent**

Run from the repository root:

```powershell
$makefile = Get-Content -Raw -Encoding UTF8 Makefile
if ($makefile -match '(?m)^ci-lint:') { throw 'ci-lint already exists' }
exit 1
```

Expected: exit `1`, proving the phase-6 target is absent.

- [ ] **Step 2: Add the pinned actionlint target**

Modify the Makefile header and targets to contain:

```make
COMPOSE ?= docker compose
DOCKER ?= docker
ACTIONLINT_IMAGE ?= rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667

.PHONY: help application build test backend-test frontend-test ci-lint up down status logs
```

Add after `frontend-test`:

```make
ci-lint: ## Validate GitHub Actions workflows
	$(DOCKER) run --rm -v "$(CURDIR):/repo" -w /repo $(ACTIONLINT_IMAGE) -color
```

- [ ] **Step 3: Verify the immutable image and target text**

Run:

```powershell
docker buildx imagetools inspect rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
$makefile = Get-Content -Raw -Encoding UTF8 Makefile
if ($makefile -notmatch '(?m)^ci-lint:') { throw 'ci-lint target missing' }
if ($makefile -notmatch 'sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667') { throw 'actionlint digest missing' }
```

Expected: the image index resolves and both assertions pass.

- [ ] **Step 4: Review the task diff**

Run:

```powershell
git diff --check
git diff -- Makefile
```

Expected: no whitespace error and only the documented Makefile additions.

- [ ] **Step 5: Commit only after explicit authorization**

If the user explicitly authorizes a task-level commit:

```powershell
git add -- Makefile
git commit -m "ci: add local workflow linting"
```

Otherwise leave the change uncommitted and continue without staging it.

---

### Task 2: Backend CI Workflow

**Files:**
- Create: `.github/workflows/backend-ci.yml`

**Interfaces:**
- Consumes: repository or Dependabot secret `MINIO_LICENSE_B64`, Docker on the hosted runner and `backend/mvnw`.
- Produces: check `Backend CI / verify` plus Surefire and JaCoCo artifacts retained for 14 days.

- [ ] **Step 1: Verify the backend workflow is absent**

Run:

```powershell
if (Test-Path .github/workflows/backend-ci.yml) { throw 'backend workflow already exists' }
exit 1
```

Expected: exit `1` because the workflow does not yet exist.

- [ ] **Step 2: Create the backend workflow**

Create `.github/workflows/backend-ci.yml` with exactly this structure:

```yaml
name: Backend CI

on:
  pull_request:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: backend-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

defaults:
  run:
    shell: bash
    working-directory: backend

jobs:
  verify:
    name: Verify backend
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Java
        uses: actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5.7.0
        with:
          distribution: temurin
          java-version: '25'
          cache: maven
          cache-dependency-path: backend/pom.xml

      - name: Prepare AIStor license
        env:
          MINIO_LICENSE_B64: ${{ secrets.MINIO_LICENSE_B64 }}
        run: |
          if [[ -z "$MINIO_LICENSE_B64" ]]; then
            echo "MINIO_LICENSE_B64 must exist in Actions or Dependabot secrets" >&2
            exit 1
          fi
          license_path="$RUNNER_TEMP/minio.license"
          printf '%s' "$MINIO_LICENSE_B64" | base64 --decode > "$license_path"
          chmod 600 "$license_path"
          echo "MINIO_LICENSE_FILE=$license_path" >> "$GITHUB_ENV"

      - name: Verify backend
        run: ./mvnw -B clean verify

      - name: Upload backend reports
        if: ${{ always() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: backend-reports-${{ github.run_id }}-${{ github.run_attempt }}
          path: |
            backend/target/surefire-reports/**
            backend/target/site/jacoco/**
          if-no-files-found: warn
          retention-days: 14

      - name: Remove AIStor license
        if: ${{ always() }}
        run: rm -f "${MINIO_LICENSE_FILE:-$RUNNER_TEMP/minio.license}"
```

- [ ] **Step 3: Verify the workflow security contract**

Run:

```powershell
$workflow = Get-Content -Raw -Encoding UTF8 .github/workflows/backend-ci.yml
foreach ($required in @(
  'permissions:',
  'contents: read',
  'ubuntu-24.04',
  'java-version: ''25''',
  './mvnw -B clean verify',
  'MINIO_LICENSE_B64',
  'retention-days: 14',
  'persist-credentials: false'
)) {
  if (-not $workflow.Contains($required)) { throw "Missing backend contract: $required" }
}
if ($workflow.Contains('pull_request_target')) { throw 'Unsafe trigger found' }
```

Expected: every contract assertion passes and no unsafe trigger exists.

- [ ] **Step 4: Lint the workflow**

Run from the repository root:

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
```

Expected: exit `0` with no actionlint error.

- [ ] **Step 5: Review the task diff**

Run:

```powershell
git diff --check
git status --short -- .github/workflows/backend-ci.yml
Get-Content -Raw -Encoding UTF8 .github/workflows/backend-ci.yml
```

Expected: only the backend workflow is added by this task.

- [ ] **Step 6: Commit only after explicit authorization**

If authorized:

```powershell
git add -- .github/workflows/backend-ci.yml
git commit -m "ci: verify backend on GitHub Actions"
```

Otherwise keep the file uncommitted and unstaged.

---

### Task 3: Frontend Coverage Command and Workflow

**Files:**
- Modify: `frontend/package.json`
- Create: `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Consumes: `frontend/package-lock.json` and the scripts `lint`, `test:ci`, `build`.
- Produces: check `Frontend CI / verify` and Angular coverage retained for 14 days.

- [ ] **Step 1: Verify coverage is not part of `test:ci`**

Run:

```powershell
$package = Get-Content -Raw -Encoding UTF8 frontend/package.json | ConvertFrom-Json
if ($package.scripts.'test:ci' -eq 'ng test --watch=false --coverage') { throw 'coverage already enabled' }
exit 1
```

Expected: exit `1`, proving the shared CI command does not yet enable coverage.

- [ ] **Step 2: Make coverage part of the shared test command**

Change only this script in `frontend/package.json`:

```json
"test:ci": "ng test --watch=false --coverage"
```

Do not modify `package-lock.json`; a script-only change does not alter dependency resolution.

- [ ] **Step 3: Run the frontend test command and prove LCOV exists**

Run from `frontend/`:

```powershell
npm run test:ci
if (-not (Test-Path coverage/frontend/lcov.info)) { throw 'LCOV report missing' }
```

Expected: all Vitest tests pass and `coverage/frontend/lcov.info` exists.

- [ ] **Step 4: Create the frontend workflow**

Create `.github/workflows/frontend-ci.yml`:

```yaml
name: Frontend CI

on:
  pull_request:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: frontend-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

defaults:
  run:
    shell: bash
    working-directory: frontend

jobs:
  verify:
    name: Verify frontend
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24.18.0
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint frontend
        run: npm run lint

      - name: Test frontend
        run: npm run test:ci

      - name: Build frontend
        run: npm run build

      - name: Upload frontend coverage
        if: ${{ always() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: frontend-coverage-${{ github.run_id }}-${{ github.run_attempt }}
          path: frontend/coverage/frontend/**
          if-no-files-found: warn
          retention-days: 14
```

- [ ] **Step 5: Lint and verify the frontend contract**

Run:

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
$workflow = Get-Content -Raw -Encoding UTF8 .github/workflows/frontend-ci.yml
foreach ($required in @('node-version: 24.18.0', 'npm ci', 'npm run lint', 'npm run test:ci', 'npm run build', 'retention-days: 14')) {
  if (-not $workflow.Contains($required)) { throw "Missing frontend contract: $required" }
}
```

Expected: actionlint exits `0` and every command is present once in the workflow.

- [ ] **Step 6: Run the remaining local frontend validations**

Run from `frontend/`:

```powershell
npm run lint
npm run build
```

Expected: lint and production build both exit `0`.

- [ ] **Step 7: Review the task diff**

Run:

```powershell
git diff --check
git diff -- frontend/package.json
git status --short -- .github/workflows/frontend-ci.yml
Get-Content -Raw -Encoding UTF8 .github/workflows/frontend-ci.yml
```

Expected: one script change and one new workflow.

- [ ] **Step 8: Commit only after explicit authorization**

If authorized:

```powershell
git add -- frontend/package.json .github/workflows/frontend-ci.yml
git commit -m "ci: verify frontend on GitHub Actions"
```

Otherwise leave both files uncommitted and unstaged.

---

### Task 4: Docker Build Workflow

**Files:**
- Create: `.github/workflows/docker.yml`

**Interfaces:**
- Consumes: `backend/Dockerfile`, `frontend/Dockerfile`, their build contexts and GitHub Actions cache.
- Produces: two independent matrix builds named `backend` and `frontend`, with no registry output.

- [ ] **Step 1: Verify the Docker workflow is absent**

Run:

```powershell
if (Test-Path .github/workflows/docker.yml) { throw 'Docker workflow already exists' }
exit 1
```

Expected: exit `1` because the workflow is absent.

- [ ] **Step 2: Create the Docker workflow**

Create `.github/workflows/docker.yml`:

```yaml
name: Docker CI

on:
  pull_request:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/**'
      - 'docker-compose.yml'
      - '.dockerignore'
      - '.github/workflows/docker.yml'
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/**'
      - 'docker-compose.yml'
      - '.dockerignore'
      - '.github/workflows/docker.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: docker-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: Build ${{ matrix.name }} image
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: backend
            context: backend
            dockerfile: backend/Dockerfile
          - name: frontend
            context: frontend
            dockerfile: frontend/Dockerfile
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e # v4.3.0

      - name: Build image
        uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a # v7.3.0
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.dockerfile }}
          push: false
          tags: devops-store-${{ matrix.name }}:ci
          cache-from: type=gha,scope=${{ matrix.name }}
          cache-to: type=gha,mode=max,scope=${{ matrix.name }}
```

- [ ] **Step 3: Lint and verify non-publication**

Run:

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
$workflow = Get-Content -Raw -Encoding UTF8 .github/workflows/docker.yml
if (($workflow | Select-String -Pattern 'push: false' -AllMatches).Matches.Count -ne 1) { throw 'push must be explicitly false once' }
if ($workflow -match '(?i)(username|password|registry|login-action)') { throw 'Registry behavior is out of scope' }
```

Expected: actionlint exits `0`, `push: false` exists and no registry credential behavior is present.

- [ ] **Step 4: Build both images locally**

Run from the repository root:

```powershell
docker build --file backend/Dockerfile --tag devops-store-backend:ci backend
docker build --file frontend/Dockerfile --tag devops-store-frontend:ci frontend
```

Expected: both commands exit `0`. These local validation tags are not pushed.

- [ ] **Step 5: Review the task diff**

Run:

```powershell
git diff --check
git status --short -- .github/workflows/docker.yml
Get-Content -Raw -Encoding UTF8 .github/workflows/docker.yml
```

Expected: only the Docker workflow is added by this task.

- [ ] **Step 6: Commit only after explicit authorization**

If authorized:

```powershell
git add -- .github/workflows/docker.yml
git commit -m "ci: validate application images"
```

Otherwise keep the file uncommitted and unstaged.

---

### Task 5: Dependabot Configuration

**Files:**
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: Maven `/backend`, npm `/frontend`, Actions `/`, Docker `/`, `/backend`, `/frontend`.
- Produces: bounded weekly dependency Pull Requests targeting `main`.

- [ ] **Step 1: Verify the configuration is absent**

Run:

```powershell
if (Test-Path .github/dependabot.yml) { throw 'Dependabot configuration already exists' }
exit 1
```

Expected: exit `1` because the configuration is absent.

- [ ] **Step 2: Create the Dependabot configuration**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: maven
    directory: /backend
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 5
    commit-message:
      prefix: chore(deps)
    groups:
      maven-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]

  - package-ecosystem: npm
    directory: /frontend
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 5
    commit-message:
      prefix: chore(deps)
    groups:
      npm-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 5
    commit-message:
      prefix: ci(deps)
    groups:
      actions-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 3
    commit-message:
      prefix: chore(deps)
    groups:
      compose-docker-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]

  - package-ecosystem: docker
    directory: /backend
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 3
    commit-message:
      prefix: chore(deps)
    groups:
      backend-docker-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]

  - package-ecosystem: docker
    directory: /frontend
    schedule:
      interval: weekly
      day: monday
      time: '06:00'
      timezone: Europe/Paris
    open-pull-requests-limit: 3
    commit-message:
      prefix: chore(deps)
    groups:
      frontend-docker-minor-patch:
        patterns: ['*']
        update-types: [minor, patch]
```

- [ ] **Step 3: Parse and format-check the YAML**

Run after `npm ci` has installed the frontend tools:

```powershell
Set-Location frontend
npm exec prettier -- --check ../.github/dependabot.yml
Set-Location ..
```

Expected: Prettier parses the file and reports it formatted.

If Prettier requests formatting, run this mechanical formatter and repeat the check:

```powershell
Set-Location frontend
npm exec prettier -- --write ../.github/dependabot.yml
Set-Location ..
```

- [ ] **Step 4: Verify all required ecosystems and immutable update scope**

Run:

```powershell
$dependabot = Get-Content -Raw -Encoding UTF8 .github/dependabot.yml
foreach ($ecosystem in @('maven', 'npm', 'github-actions', 'docker')) {
  if ($dependabot -notmatch "package-ecosystem: $ecosystem") { throw "Missing ecosystem: $ecosystem" }
}
if (($dependabot | Select-String -Pattern 'package-ecosystem: docker' -AllMatches).Matches.Count -ne 3) {
  throw 'Docker updates must cover root, backend and frontend'
}
```

Expected: four ecosystems are present and Docker has three directories.

- [ ] **Step 5: Review the task diff**

Run:

```powershell
git diff --check
git status --short -- .github/dependabot.yml
Get-Content -Raw -Encoding UTF8 .github/dependabot.yml
```

Expected: only the Dependabot configuration is added by this task.

- [ ] **Step 6: Commit only after explicit authorization**

If authorized:

```powershell
git add -- .github/dependabot.yml
git commit -m "ci: configure dependency updates"
```

Otherwise keep the file uncommitted and unstaged.

---

### Task 6: CI Documentation and Roadmap Reconciliation

**Files:**
- Create: `docs/devops/github-actions.md`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: the three workflows, Dependabot file, Makefile target and approved secret design.
- Produces: operator-facing setup and an evidence-based phase-6 status.

- [ ] **Step 1: Verify the CI guide is absent**

Run:

```powershell
if (Test-Path docs/devops/github-actions.md) { throw 'GitHub Actions guide already exists' }
exit 1
```

Expected: exit `1` because the guide is absent.

- [ ] **Step 2: Create the operator guide**

Create `docs/devops/github-actions.md` with these sections and concrete content:

```markdown
# GitHub Actions

La CI sépare backend, frontend et builds Docker. Elle s'exécute sur les Pull Requests vers `main`,
les pushes sur `main` et à la demande. Les filtres de chemins évitent les validations sans rapport.

## Workflows

| Workflow | Validation | Artefact |
|---|---|---|
| Backend CI | Java 25, Maven, PostgreSQL et AIStor | Surefire et JaCoCo, 14 jours |
| Frontend CI | npm, ESLint, Vitest avec couverture et build Angular | couverture HTML/LCOV, 14 jours |
| Docker CI | images backend et frontend avec Buildx | aucune image publiée |

## Licence AIStor

Créer `MINIO_LICENSE_B64` avec la même valeur dans les secrets Actions et Dependabot. La valeur est
le contenu Base64 du fichier local référencé par `MINIO_LICENSE_FILE`. Elle est décodée sous
`RUNNER_TEMP`, utilisée uniquement par le job backend puis supprimée avec `always()`.

Sous PowerShell, produire la valeur sans l'afficher puis la transmettre à GitHub CLI :

```powershell
$licenseBytes = [System.IO.File]::ReadAllBytes($env:MINIO_LICENSE_FILE)
$licenseBase64 = [Convert]::ToBase64String($licenseBytes)
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app actions
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app dependabot
Remove-Variable licenseBytes, licenseBase64
```

Les Pull Requests de forks ne reçoivent aucun secret. Importer le changement vérifié dans une
branche interne avant d'exécuter le backend complet.

## Commandes locales

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
Set-Location backend
./mvnw clean verify
Set-Location ../frontend
npm ci
npm run lint
npm run test:ci
npm run build
```

Le backend requiert Docker et `MINIO_LICENSE_FILE`. Le build Docker ne publie aucune image.

## Permissions et dépendances

Tous les workflows utilisent uniquement `contents: read`. Chaque action est épinglée à un SHA
complet avec sa version en commentaire. Dependabot vérifie Maven, npm, GitHub Actions et Docker
chaque semaine.

## Diagnostic

- licence absente : vérifier le nom dans les deux magasins de secrets ;
- rapports absents : consulter l'étape de build initiale, l'upload reste non bloquant ;
- cache manqué : le téléchargement normal des dépendances doit continuer ;
- workflow filtré : vérifier les chemins modifiés et ne pas rendre ce contrôle obligatoire sans
  contrôle agrégateur toujours exécuté ;
- build Docker en échec : reproduire avec `docker build` sur le même contexte.
```

- [ ] **Step 3: Link the guide from both indexes**

Add to the available-documents table in `docs/README.md`:

```markdown
| [GitHub Actions](devops/github-actions.md) | Workflows CI, artefacts, permissions, secrets et dépannage |
```

Replace the planned plain-text GitHub Actions entry in the DevOps section with a Markdown link.

Add to the root README documentation list:

```markdown
- [GitHub Actions](docs/devops/github-actions.md)
```

- [ ] **Step 4: Reconcile phase 6 with GitHub Flow**

In `docs/IMPLEMENTATION_PLAN.md`, replace the obsolete trigger item with:

```markdown
- [x] Déclencher les Pull Requests vers `main`, les pushes sur `main` et les lancements manuels
  avec des filtres de chemins pertinents.
```

Mark implementation items complete only when their corresponding files and local validations
exist. Leave hosted-run acceptance criteria unchecked until Task 7 observes real GitHub runs.

- [ ] **Step 5: Validate documentation contracts**

Run:

```powershell
$guide = Get-Content -Raw -Encoding UTF8 docs/devops/github-actions.md
foreach ($required in @('MINIO_LICENSE_B64', 'Dependabot', 'contents: read', 'actionlint:1.7.12', '14 jours', 'docker build')) {
  if (-not $guide.Contains($required)) { throw "Missing guide contract: $required" }
}
foreach ($path in @('docs/devops/github-actions.md', 'docs/README.md', 'README.md', 'docs/IMPLEMENTATION_PLAN.md')) {
  if (-not (Test-Path $path)) { throw "Missing documentation file: $path" }
}
git diff --check
```

Expected: every contract is documented and no whitespace error exists.

- [ ] **Step 6: Review the documentation diff**

Run:

```powershell
git diff -- docs/README.md README.md docs/IMPLEMENTATION_PLAN.md
git status --short -- docs/devops/github-actions.md
Get-Content -Raw -Encoding UTF8 docs/devops/github-actions.md
```

Expected: documentation reflects implemented capabilities, and hosted criteria remain unchecked.

- [ ] **Step 7: Commit only after explicit authorization**

If authorized:

```powershell
git add -- docs/devops/github-actions.md docs/README.md README.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document GitHub Actions workflows"
```

Otherwise leave the files uncommitted and unstaged.

---

### Task 7: Full Validation and Hosted Activation

**Files:**
- Modify after hosted evidence: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: all phase-6 files, local AIStor license, GitHub repository access and explicit user authorization.
- Produces: locally validated CI plus observed GitHub checks and final phase-6 acceptance state.

- [ ] **Step 1: Run the full local configuration audit**

Run from the repository root:

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color

$workflowFiles = Get-ChildItem .github/workflows -Filter *.yml
if ($workflowFiles.Count -ne 3) { throw 'Exactly three workflows are required' }

foreach ($file in $workflowFiles) {
  $content = Get-Content -Raw -Encoding UTF8 $file.FullName
  if ($content -notmatch '(?m)^permissions:\r?$') { throw "Missing permissions block: $($file.Name)" }
  if ($content -notmatch '(?m)^  contents: read\r?$') { throw "Missing contents: read: $($file.Name)" }
  if ($content -match 'pull_request_target') { throw "Unsafe trigger: $($file.Name)" }
  foreach ($uses in [regex]::Matches($content, 'uses:\s+[^@\s]+@([^\s#]+)')) {
    if ($uses.Groups[1].Value -notmatch '^[0-9a-f]{40}$') {
      throw "Unpinned action in $($file.Name): $($uses.Value)"
    }
  }
}

git diff --check
```

Expected: actionlint passes, exactly three workflows exist, all permissions are read-only and every action uses a 40-character SHA.

- [ ] **Step 2: Run complete backend validation**

Confirm `MINIO_LICENSE_FILE` references a readable local license, then run:

```powershell
Set-Location backend
./mvnw.cmd clean verify
Set-Location ..
```

Expected: Maven exits `0`, all Testcontainers tests pass and `backend/target/site/jacoco/jacoco.xml` exists.

- [ ] **Step 3: Run complete frontend validation**

Run:

```powershell
Set-Location frontend
npm ci
npm run lint
npm run test:ci
npm run build
if (-not (Test-Path coverage/frontend/lcov.info)) { throw 'LCOV report missing' }
Set-Location ..
```

Expected: install, lint, tests and build exit `0`; LCOV exists.

- [ ] **Step 4: Rebuild both Docker images**

Run:

```powershell
docker build --file backend/Dockerfile --tag devops-store-backend:ci backend
docker build --file frontend/Dockerfile --tag devops-store-frontend:ci frontend
```

Expected: both builds exit `0` without registry login or push.

- [ ] **Step 5: Stop for external-state authorization**

Present the validated file list and ask the user for explicit authorization to:

1. create or update Actions and Dependabot secrets `MINIO_LICENSE_B64` ;
2. commit the phase-6 files ;
3. push `codex/phase-6-github-actions` ;
4. create a Pull Request against `main`.

Do not perform any of these four actions until authorization is received.

- [ ] **Step 6: Create both secrets without logging their value**

After authorization, require `MINIO_LICENSE_FILE` to reference the local license and run:

```powershell
if (-not (Test-Path -LiteralPath $env:MINIO_LICENSE_FILE -PathType Leaf)) {
  throw 'MINIO_LICENSE_FILE must reference a readable license file'
}
$licenseBytes = [System.IO.File]::ReadAllBytes($env:MINIO_LICENSE_FILE)
$licenseBase64 = [Convert]::ToBase64String($licenseBytes)
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app actions --repo mouhamadoulo/molo-devops-lab
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app dependabot --repo mouhamadoulo/molo-devops-lab
Remove-Variable licenseBytes, licenseBase64
gh secret list --app actions --repo mouhamadoulo/molo-devops-lab
gh secret list --app dependabot --repo mouhamadoulo/molo-devops-lab
```

Expected: both lists contain the name `MINIO_LICENSE_B64`; no value appears.

- [ ] **Step 7: Commit only the complete phase-6 scope**

If task-level commits were not already authorized and created, stage exactly:

```powershell
git add -- Makefile frontend/package.json .github/workflows/backend-ci.yml .github/workflows/frontend-ci.yml .github/workflows/docker.yml .github/dependabot.yml docs/devops/github-actions.md docs/README.md README.md docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-24-github-actions-ci-design.md docs/superpowers/plans/2026-08-24-github-actions-ci.md
git diff --cached --check
git diff --cached --name-status
git commit -m "ci: add GitHub Actions pipelines"
```

Expected: the commit uses only the configured Git identity and contains no assistance trailers.

- [ ] **Step 8: Push the feature branch and open the Pull Request**

Run only from `codex/phase-6-github-actions`:

```powershell
git push -u origin codex/phase-6-github-actions
$prBody = @'
## Résumé

- ajoute des workflows indépendants pour le backend, le frontend et les images Docker ;
- conserve les rapports JaCoCo, Surefire et LCOV pendant 14 jours ;
- configure Dependabot et actionlint avec des références immuables.

## Validation

- [x] Backend `clean verify`
- [x] Frontend lint, tests avec couverture et build
- [x] Builds Docker backend et frontend
- [x] actionlint et `git diff --check`

## Sécurité

- [x] `contents: read` uniquement
- [x] Licence AIStor fournie par secrets Actions et Dependabot
- [x] Aucune publication d'image ou d'artefact applicatif

## Retour arrière

Revert du commit de squash ; aucune migration de données ni publication externe.
'@
gh pr create --base main --head codex/phase-6-github-actions --title "ci: add GitHub Actions pipelines" --body $prBody
Remove-Variable prBody
```

Before `gh pr create`, confirm that every checked validation above has fresh evidence from Steps 1–4; never submit an unchecked claim.

Expected: GitHub returns the Pull Request URL.

- [ ] **Step 9: Observe hosted workflows**

Run:

```powershell
gh pr checks --watch --interval 10
```

Expected: Backend CI, Frontend CI and both Docker matrix builds complete successfully. Download or inspect the backend and frontend artifacts from the Actions run and confirm their retention is 14 days.

- [ ] **Step 10: Record hosted evidence without premature completion**

After all hosted checks pass, mark the three phase-6 acceptance criteria `[x]` in
`docs/IMPLEMENTATION_PLAN.md` and record the Pull Request/check evidence in
`docs/devops/github-actions.md`. Commit this documentation update only with explicit authorization:

```powershell
git add -- docs/IMPLEMENTATION_PLAN.md docs/devops/github-actions.md
git commit -m "docs: record GitHub Actions validation"
git push
```

Expected: the Pull Request includes the evidence commit and remains green.

---

## Final Verification Checklist

- [ ] Exactly three workflow files exist and pass actionlint.
- [ ] Every `uses:` reference is one of the verified 40-character SHAs in this plan.
- [ ] Every workflow uses `ubuntu-24.04`, path filters, concurrency and `contents: read`.
- [ ] No workflow contains `pull_request_target`, registry credentials or image publication.
- [ ] Backend `clean verify` passes with PostgreSQL and licensed AIStor Testcontainers.
- [ ] Frontend lint, coverage tests and production build pass using the same local/CI commands.
- [ ] Both Dockerfiles build locally and in GitHub Actions.
- [ ] Reports upload with `always()` and remain available for 14 days.
- [ ] Actions and Dependabot both contain `MINIO_LICENSE_B64`, with no value in logs or Git.
- [ ] Dependabot covers Maven, npm, GitHub Actions and all three Docker directories.
- [ ] Documentation matches the observed hosted behavior before phase 6 is declared complete.
- [ ] `git diff --check` passes and the final working tree contains no unrelated changes.
