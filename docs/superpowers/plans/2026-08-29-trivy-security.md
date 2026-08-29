# Trivy Security Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer des scans Trivy 0.73.0 reproductibles et bloquants pour le dépôt, les secrets, l’IaC et les images backend/frontend, localement et dans GitHub Actions.

**Architecture:** Un fichier `trivy.yaml` porte la politique commune et des cibles Make exécutent les scans via l’image Trivy signée et épinglée. Un workflow `security.yml` analyse le dépôt et la configuration, tandis que le workflow Docker existant charge puis analyse chaque image sans reconstruction supplémentaire. Les rapports texte et SARIF sont toujours conservés ; l’upload Code Scanning reste conditionnel car il est désactivé sur le dépôt privé actuel.

**Tech Stack:** Trivy 0.73.0, Cosign 3.1.3, Docker 29/Docker Compose 5, GNU Make, GitHub Actions, Trivy Action 0.36.0, CodeQL Action 4.37.9 et upload-artifact 7.0.1.

**Spec:** `docs/superpowers/specs/2026-08-28-trivy-security-design.md`

## Global Constraints

- Utiliser `ghcr.io/aquasecurity/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c`.
- Utiliser `gcr.io/projectsigstore/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8`.
- Épingler `aquasecurity/setup-trivy` à `3fb12ec12f41e471780db15c232d5dd185dcb514` (v0.2.6).
- Épingler `aquasecurity/trivy-action` à `a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8` (v0.36.0).
- Épingler `github/codeql-action/upload-sarif` à `cdf488f595d80d6e07e03d4674febd5ab45fa938` (v4.37.9).
- Réutiliser `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (v7.0.1), déjà validé dans le dépôt.
- Bloquer les vulnérabilités corrigibles et toutes les alertes secret/misconfiguration de sévérité `HIGH` ou `CRITICAL`.
- Ne créer `.trivyignore.yaml` qu’après un constat réel et une approbation portant sur l’identifiant, le chemin, la justification, le responsable et l’expiration.
- Ne jamais versionner `reports/security/`, `.trivycache/`, `.m2/`, une base Trivy ou une valeur de secret.
- Ne jamais annoncer un scan, une signature ou un workflow distant comme réussi sans sortie réelle correspondante.
- Ne créer aucun commit ni push sans autorisation explicite. Chaque étape de commit ci-dessous est conditionnelle à cette autorisation.
- Si un worktree isolé est choisi à l’exécution, utiliser `superpowers:using-git-worktrees`. Comme la spécification et ce plan sont initialement non suivis, les committer avec autorisation ou les recréer explicitement dans le worktree avant de commencer.

## File Map

| Fichier | Responsabilité |
|---|---|
| `trivy.yaml` | Politique commune de sévérité et de vulnérabilités corrigibles |
| `.gitignore` | Exclusion du cache et des rapports générés |
| `Makefile` | Provenance, scans locaux et commande d’acceptance locale |
| `.github/workflows/security.yml` | Scans PR/main/manuel/hebdomadaire du dépôt et de l’IaC |
| `.github/workflows/docker.yml` | Build chargé et scan de chaque image CI |
| `.trivyignore.yaml` | Absent par défaut ; exceptions structurées uniquement si approuvées |
| `docs/devops/trivy.md` | Exploitation, politique, rapports, mise à jour et dépannage |
| `docs/devops/github-actions.md` | Inventaire des nouveaux jobs, permissions et artefacts |
| `README.md` | État réel, commandes principales et lien vers le guide |
| `docs/README.md` | Index du guide Trivy devenu disponible |
| `AGENTS.md` | Stack et commandes effectivement implémentées |
| `docs/IMPLEMENTATION_PLAN.md` | Version 0.73.0, cases de phase et preuves d’acceptation |

---

### Task 0: Baseline et isolation d’exécution

**Files:**
- Read: `docs/superpowers/specs/2026-08-28-trivy-security-design.md`
- Read: `docs/superpowers/plans/2026-08-29-trivy-security.md`
- No production files modified.

**Interfaces:**
- Consumes: dépôt `main`, Docker Desktop Linux, Docker Buildx et GNU Make.
- Produces: un espace de travail propre et une baseline dont les échecs sont attribuables à la phase 8.

- [x] **Step 1: Choisir et vérifier l’espace de travail**

Utiliser `superpowers:using-git-worktrees` si l’utilisateur choisit l’exécution isolée. Sinon,
confirmer explicitement l’exécution dans le workspace courant.

Run:

```powershell
git branch --show-current
git status -sb
git worktree list
```

Expected: branche et worktree connus ; seuls la spécification et le plan Trivy sont nouveaux. Tout
autre changement utilisateur est préservé et exclu du périmètre.

- [x] **Step 2: Vérifier les outils sans mutation du dépôt**

Run:

```powershell
docker version
docker buildx version
make --version
```

Expected: le client et le serveur Docker répondent, Buildx est disponible et GNU Make s’exécute.
L’état observé le 29 août 2026 est un HTTP 500 du moteur Docker Desktop Linux ; si cet état persiste,
arrêter l’exécution et ne pas prétendre que la signature ou les scans sont validés.

- [x] **Step 3: Valider la CI existante avant modification**

Run:

```powershell
make ci-lint
docker compose config --quiet
```

Expected: actionlint et la configuration Compose existante réussissent.

- [x] **Step 4: Construire la baseline des images**

Run:

```powershell
docker compose build --pull
docker image inspect devops-store-backend:local
docker image inspect devops-store-frontend:local
```

Expected: les deux images locales existent et leur inspection renvoie un digest/config valides.

---

### Task 1: Socle Trivy signé et politique commune

**Files:**
- Create: `trivy.yaml`
- Modify: `.gitignore:34-40`
- Modify: `Makefile:1-12`
- Modify: `Makefile:66+`

**Interfaces:**
- Consumes: `DOCKER`, le registre GHCR, le registre Sigstore et les deux digests globaux.
- Produces: `TRIVY_IMAGE`, `COSIGN_IMAGE`, `trivy-verify` et la politique `trivy.yaml` utilisée par toutes les tâches suivantes.

- [x] **Step 1: Exécuter le contrôle rouge de l’interface absente**

Run:

```powershell
make trivy-verify
```

Expected: FAIL avec `No rule to make target 'trivy-verify'`.

- [x] **Step 2: Créer la politique commune**

Create `trivy.yaml`:

```yaml
severity:
  - HIGH
  - CRITICAL
exit-code: 1
vulnerability:
  ignore-unfixed: true
```

- [x] **Step 3: Ignorer uniquement les sorties générées**

Ajouter sous `# Infrastructure tooling` dans `.gitignore` :

```gitignore
.m2/
reports/security/
```

Conserver l’entrée existante `.trivycache/`.

- [x] **Step 4: Déclarer les images, répertoires et cibles Make**

Ajouter après `ACTIONLINT_IMAGE` dans `Makefile` :

```make
MAVEN_IMAGE ?= maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2
TRIVY_IMAGE ?= ghcr.io/aquasecurity/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c
COSIGN_IMAGE ?= gcr.io/projectsigstore/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8
TRIVY_CACHE_DIR ?= $(CURDIR)/.trivycache
SECURITY_REPORTS_DIR ?= $(CURDIR)/reports/security
MAVEN_CACHE_DIR ?= $(CURDIR)/.m2
MAVEN_REPOSITORY_DIR ?= $(MAVEN_CACHE_DIR)/repository
```

Étendre `.PHONY` avec :

```make
	trivy-verify trivy-fs trivy-config trivy-image-backend trivy-image-frontend \
	trivy-images security
```

Ajouter après `ci-lint` :

```make
trivy-verify: ## Verify the pinned Trivy image signature and version
	$(DOCKER) run --rm $(COSIGN_IMAGE) verify $(TRIVY_IMAGE) \
		--certificate-identity-regexp 'https://github\.com/aquasecurity/trivy/\.github/workflows/.+' \
		--certificate-oidc-issuer 'https://token.actions.githubusercontent.com'
	$(DOCKER) run --rm $(TRIVY_IMAGE) --version | grep -F 'Version: 0.73.0'
```

- [x] **Step 5: Vérifier la signature et la version réelles**

Run:

```powershell
make trivy-verify
```

Expected: Cosign indique que les claims, le journal de transparence et le certificat sont valides,
puis Trivy affiche `Version: 0.73.0`.

- [x] **Step 6: Contrôler le diff du socle**

Run:

```powershell
git diff --check
git diff -- Makefile .gitignore
Get-Content trivy.yaml -Raw
```

Expected: aucun problème de whitespace ; seuls les digests, la politique et le target de
provenance prévus apparaissent.

- [x] **Step 7: Commit conditionnel du socle**

Uniquement après autorisation explicite :

```powershell
git add -- Makefile .gitignore trivy.yaml
git commit -m "build: pin Trivy security tooling"
```

Non exécuté le 29 août 2026 : aucune autorisation de commit d’implémentation n’a été donnée.

---

### Task 2: Scans locaux du dépôt et de l’IaC

**Files:**
- Modify: `Makefile` after `trivy-verify`

**Interfaces:**
- Consumes: `trivy.yaml`, `TRIVY_IMAGE`, `TRIVY_CACHE_DIR`, `SECURITY_REPORTS_DIR`.
- Produces: `trivy-fs`, `trivy-config`, `filesystem.txt`, `filesystem.sarif`, `config.txt` et `config.sarif`.

- [x] **Step 1: Exécuter les contrôles rouges des deux targets absents**

Run:

```powershell
make trivy-fs
make trivy-config
```

Expected: chaque commande répond `Rien à faire` parce que le target est déjà déclaré `.PHONY`
mais ne possède encore aucune recette de scan.

- [x] **Step 2: Ajouter le runner filesystem/config en lecture seule**

Ajouter avec les variables Make :

```make
TRIVY_SKIP_DIRS := --skip-dirs backend/target --skip-dirs frontend/node_modules \
	--skip-dirs frontend/dist --skip-dirs frontend/coverage --skip-dirs .m2 \
	--skip-dirs reports/security
MAVEN_CACHE_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR)/backend/pom.xml:/workspace/pom.xml:ro" \
	-v "$(MAVEN_CACHE_DIR):/root/.m2" \
	-w /workspace $(MAVEN_IMAGE)
TRIVY_REPOSITORY_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR):/workspace:ro" \
	-v "$(TRIVY_CACHE_DIR):/root/.cache/trivy" \
	-v "$(MAVEN_REPOSITORY_DIR):/root/.m2/repository:ro" \
	-v "$(SECURITY_REPORTS_DIR):/reports" \
	-w /workspace $(TRIVY_IMAGE)
```

- [x] **Step 3: Ajouter le scan filesystem avec rapports puis gate**

Ajouter après `trivy-verify` :

```make
trivy-prepare-maven:
	$(MAVEN_CACHE_RUN) mvn -B -DskipTests dependency:resolve

trivy-fs: trivy-prepare-maven ## Scan repository dependencies, misconfigurations and secrets
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format table --exit-code 0 \
		--output /reports/filesystem.txt .
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format sarif --exit-code 0 \
		--output /reports/filesystem.sarif .
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format table --exit-code 1 .
```

- [x] **Step 4: Ajouter le scan IaC autonome**

Ajouter immédiatement après :

```make
trivy-config: ## Scan Dockerfiles and supported current or future IaC files
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format table --exit-code 0 --output /reports/config.txt .
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format sarif --exit-code 0 --output /reports/config.sarif .
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format table --exit-code 1 .
```

- [x] **Step 5: Exécuter les scans réels**

Run:

```powershell
make trivy-fs
make trivy-config
Get-ChildItem reports/security
```

Expected: quatre rapports non vides existent. Les targets retournent 0 seulement si aucune alerte
bloquante n’est présente. En cas d’alerte, conserver les rapports et suivre Task 6 ; ne pas ajouter
d’ignore dans cette tâche.

Résultat réel : les quatre rapports sont non vides et le scan `config` est vert sur les deux
Dockerfiles détectés. Le gate filesystem bloque comme prévu sur `CVE-2026-54291` dans
`org.postgresql:postgresql` 42.7.11 ; la correction est routée vers Task 6. Trivy 0.73.0 ne possède
pas de scanner `config` natif pour Compose ou GitHub Actions, qui restent validés respectivement par
`docker compose config` et actionlint.

- [x] **Step 6: Commit conditionnel des scans dépôt/IaC**

Uniquement après autorisation explicite :

```powershell
git add -- Makefile
git commit -m "build: add repository security scans"
```

Non exécuté : aucun commit d’implémentation supplémentaire n’est autorisé à ce stade.

---

### Task 3: Scans locaux des images et commande agrégée

**Files:**
- Modify: `Makefile` after `trivy-config`

**Interfaces:**
- Consumes: images `devops-store-backend:local` et `devops-store-frontend:local`, socket Docker, cache et politique commune.
- Produces: deux targets d’image, quatre rapports image et le target agrégé `security`.

- [x] **Step 1: Exécuter le contrôle rouge du target agrégé absent**

Run:

```powershell
make trivy-images
```

Expected: la commande répond `Rien à faire` parce que le target est déjà déclaré `.PHONY`, mais ne
possède encore aucune recette ni dépendance.

- [x] **Step 2: Ajouter le runner d’image avec accès Docker limité**

Ajouter avec les variables Make :

```make
TRIVY_IMAGE_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR):/workspace:ro" \
	-v "$(TRIVY_CACHE_DIR):/root/.cache/trivy" \
	-v "$(SECURITY_REPORTS_DIR):/reports" \
	-v /var/run/docker.sock:/var/run/docker.sock \
	-w /workspace $(TRIVY_IMAGE)
```

- [x] **Step 3: Ajouter le scan backend complet**

Ajouter après `trivy-config` :

```make
trivy-image-backend: ## Scan the local backend runtime image
	$(DOCKER) image inspect --format "{{.Id}}" devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 0 --output /reports/image-backend.txt \
		devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format sarif --exit-code 0 --output /reports/image-backend.sarif \
		devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 1 devops-store-backend:local
```

- [x] **Step 4: Ajouter le scan frontend complet**

Ajouter immédiatement après :

```make
trivy-image-frontend: ## Scan the local frontend runtime image
	$(DOCKER) image inspect --format "{{.Id}}" devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 0 --output /reports/image-frontend.txt \
		devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format sarif --exit-code 0 --output /reports/image-frontend.sarif \
		devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 1 devops-store-frontend:local

trivy-images: trivy-image-backend trivy-image-frontend ## Scan both local runtime images

security: ## Verify Trivy, scan repository/IaC, build and scan both images
	$(MAKE) trivy-verify
	$(MAKE) trivy-fs
	$(MAKE) trivy-config
	$(MAKE) build
	$(MAKE) trivy-images
```

- [x] **Step 5: Exécuter les deux scans d’images**

Run:

```powershell
make trivy-images
Get-ChildItem reports/security/image-*
```

Expected: rapports texte et SARIF pour chaque image ; retour 0 uniquement sans alerte bloquante.
Une image absente fait échouer immédiatement `docker image inspect` avec le nom exact de l’image.

Résultat réel : les quatre rapports image sont non vides. Les gates bloquent sur quatre alertes
HIGH backend (PostgreSQL et OpenSSL) et vingt-sept alertes frontend (25 HIGH, 2 CRITICAL) provenant
de l’image Nginx/Alpine existante. Toutes sont routées vers Task 6, sans ignore.

- [x] **Step 6: Vérifier l’interface complète sans relancer les scans**

Run:

```powershell
make help
make -n security
```

Expected: les cinq cibles publiques sont listées et l’ordre provenance → dépôt → IaC → build →
images est visible.

- [x] **Step 7: Commit conditionnel des scans d’images**

Uniquement après autorisation explicite :

```powershell
git add -- Makefile
git commit -m "build: add image security scans"
```

Non exécuté : aucun commit d’implémentation supplémentaire n’est autorisé à ce stade.

---

### Task 4: Workflow GitHub Actions dépôt et IaC

**Files:**
- Create: `.github/workflows/security.yml`

**Interfaces:**
- Consumes: `trivy.yaml`, actions épinglées et variable optionnelle `ENABLE_CODE_SCANNING`.
- Produces: matrice CI `filesystem`/`config`, artefacts texte/SARIF et gates PR/main/hebdomadaires.

- [x] **Step 1: Exécuter le contrôle rouge actionlint**

Créer temporairement le fichier avec seulement `name: Security`, puis exécuter :

```powershell
make ci-lint
```

Expected: FAIL car le workflow ne possède ni déclencheur ni job. Remplacer immédiatement ce
contenu minimal à l’étape suivante.

- [x] **Step 2: Écrire le workflow complet**

Remplacer `.github/workflows/security.yml` par :

```yaml
name: Security

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 5 * * 1'
  workflow_dispatch:

permissions:
  actions: read
  contents: read
  security-events: write

concurrency:
  group: security-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  repository:
    name: Scan ${{ matrix.label }}
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include:
          - label: repository
            report: filesystem
            scan_type: fs
            scanners: vuln,misconfig,secret
          - label: infrastructure configuration
            report: config
            scan_type: config
            scanners: misconfig
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Java for Maven metadata
        if: matrix.scan_type == 'fs'
        uses: actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5.7.0
        with:
          distribution: temurin
          java-version: '25'
          cache: maven
          cache-dependency-path: backend/pom.xml

      - name: Populate Maven dependency cache
        if: matrix.scan_type == 'fs'
        working-directory: backend
        shell: bash
        run: ./mvnw -B -DskipTests dependency:resolve

      - name: Set up Trivy
        uses: aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514 # v0.2.6
        with:
          version: v0.73.0
          cache: true

      - name: Verify Trivy version
        shell: bash
        run: |
          trivy --version | grep -F 'Version: 0.73.0'

      - name: Prepare report directory
        shell: bash
        run: mkdir -p reports/security

      - name: Generate human-readable report
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          scan-type: ${{ matrix.scan_type }}
          scan-ref: .
          scanners: ${{ matrix.scanners }}
          skip-dirs: backend/target,frontend/node_modules,frontend/dist,frontend/coverage,.m2,reports/security
          trivy-config: trivy.yaml
          format: table
          output: reports/security/${{ matrix.report }}.txt
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: 0
          skip-setup-trivy: true

      - name: Generate SARIF report
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          scan-type: ${{ matrix.scan_type }}
          scan-ref: .
          scanners: ${{ matrix.scanners }}
          skip-dirs: backend/target,frontend/node_modules,frontend/dist,frontend/coverage,.m2,reports/security
          trivy-config: trivy.yaml
          format: sarif
          output: reports/security/${{ matrix.report }}.sarif
          severity: HIGH,CRITICAL
          limit-severities-for-sarif: true
          ignore-unfixed: true
          exit-code: 0
          skip-setup-trivy: true

      - name: Enforce security gate
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          scan-type: ${{ matrix.scan_type }}
          scan-ref: .
          scanners: ${{ matrix.scanners }}
          skip-dirs: backend/target,frontend/node_modules,frontend/dist,frontend/coverage,.m2,reports/security
          trivy-config: trivy.yaml
          format: table
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: 1
          skip-setup-trivy: true

      - name: Upload Trivy reports
        if: ${{ always() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: trivy-${{ matrix.report }}-${{ github.run_id }}-${{ github.run_attempt }}
          path: reports/security/${{ matrix.report }}.*
          if-no-files-found: error
          retention-days: 14

      - name: Upload SARIF to Code Scanning
        if: ${{ always() && vars.ENABLE_CODE_SCANNING == 'true' && github.actor != 'dependabot[bot]' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}
        uses: github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938 # v4.37.9
        with:
          sarif_file: reports/security/${{ matrix.report }}.sarif
          category: trivy-${{ matrix.report }}
```

- [x] **Step 3: Valider le workflow**

Run:

```powershell
make ci-lint
rg -n "uses: [^@]+@(v|main|master|latest)" .github/workflows/security.yml
```

Expected: actionlint réussit et `rg` ne retourne aucune action basée sur un tag mobile.

- [x] **Step 4: Commit conditionnel du workflow sécurité**

Uniquement après autorisation explicite :

```powershell
git add -- .github/workflows/security.yml
git commit -m "ci: add Trivy repository scans"
```

Non exécuté : aucun commit d’implémentation supplémentaire n’est autorisé à ce stade.

---

### Task 5: Scans Trivy dans le workflow Docker

**Files:**
- Modify: `.github/workflows/docker.yml:5-64`

**Interfaces:**
- Consumes: matrice Docker existante, `trivy.yaml`, images `devops-store-${{ matrix.name }}:ci`.
- Produces: build chargé, rapport et gate indépendants pour backend et frontend.

- [x] **Step 1: Ajouter le chargement d’image et constater l’absence du scan**

Ajouter temporairement `load: true` au step `Build image`, puis exécuter :

```powershell
rg -n "trivy-action" .github/workflows/docker.yml
```

Expected: aucun résultat, ce qui confirme que le build est chargeable mais pas encore scanné.

- [x] **Step 2: Étendre les déclencheurs et permissions**

Ajouter `trivy.yaml` et `.trivyignore.yaml` aux filtres `paths` de `pull_request` et `push`.
Remplacer les permissions par :

```yaml
permissions:
  actions: read
  contents: read
  security-events: write
```

Conserver `load: true`, `push: false`, le tag `devops-store-${{ matrix.name }}:ci` et les caches
Buildx existants.

- [x] **Step 3: Installer et vérifier Trivy après le build**

Ajouter après `Build image` :

```yaml
      - name: Set up Trivy
        uses: aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514 # v0.2.6
        with:
          version: v0.73.0
          cache: true

      - name: Verify Trivy version
        shell: bash
        run: |
          trivy --version | grep -F 'Version: 0.73.0'

      - name: Prepare report directory
        shell: bash
        run: mkdir -p reports/security
```

- [x] **Step 4: Générer les rapports image et appliquer le gate**

Ajouter immédiatement après :

```yaml
      - name: Generate human-readable image report
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          image-ref: devops-store-${{ matrix.name }}:ci
          scanners: vuln,misconfig,secret
          trivy-config: trivy.yaml
          format: table
          output: reports/security/image-${{ matrix.name }}.txt
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: 0
          skip-setup-trivy: true

      - name: Generate image SARIF report
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          image-ref: devops-store-${{ matrix.name }}:ci
          scanners: vuln,misconfig,secret
          trivy-config: trivy.yaml
          format: sarif
          output: reports/security/image-${{ matrix.name }}.sarif
          severity: HIGH,CRITICAL
          limit-severities-for-sarif: true
          ignore-unfixed: true
          exit-code: 0
          skip-setup-trivy: true

      - name: Enforce image security gate
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          image-ref: devops-store-${{ matrix.name }}:ci
          scanners: vuln,misconfig,secret
          trivy-config: trivy.yaml
          format: table
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: 1
          skip-setup-trivy: true
```

- [x] **Step 5: Publier les rapports même après échec**

Ajouter après le gate :

```yaml
      - name: Upload Trivy image reports
        if: ${{ always() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: trivy-image-${{ matrix.name }}-${{ github.run_id }}-${{ github.run_attempt }}
          path: reports/security/image-${{ matrix.name }}.*
          if-no-files-found: error
          retention-days: 14

      - name: Upload image SARIF to Code Scanning
        if: ${{ always() && vars.ENABLE_CODE_SCANNING == 'true' && github.actor != 'dependabot[bot]' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}
        uses: github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938 # v4.37.9
        with:
          sarif_file: reports/security/image-${{ matrix.name }}.sarif
          category: trivy-image-${{ matrix.name }}
```

- [x] **Step 6: Valider le workflow Docker enrichi**

Run:

```powershell
make ci-lint
rg -n "load: true|trivy-action@a9c7b0f|upload-artifact@043fb46d|upload-sarif@cdf488f" .github/workflows/docker.yml
```

Expected: actionlint réussit ; les quatre marqueurs attendus sont présents et toutes les actions
restent épinglées par SHA complet.

- [x] **Step 7: Commit conditionnel du workflow Docker**

Uniquement après autorisation explicite :

```powershell
git add -- .github/workflows/docker.yml
git commit -m "ci: scan Docker images with Trivy"
```

Non exécuté : aucun commit d’implémentation supplémentaire n’est autorisé à ce stade.

---

### Task 6: Baseline réelle et remédiation gouvernée

**Files:**
- Read: `reports/security/*.txt`
- Read: `reports/security/*.sarif`
- Modify only after an evidence-specific plan: the exact manifest, Dockerfile, workflow or source reported by Trivy.
- Create only after explicit approval: `.trivyignore.yaml`

**Interfaces:**
- Consumes: les cinq targets Make et les huit rapports locaux.
- Produces: une baseline verte ou un arrêt documenté avec identifiants et fichiers exacts à corriger.

- [x] **Step 1: Vérifier de nouveau le moteur Docker**

Run:

```powershell
docker version
```

Expected: sections `Client` et `Server` complètes. Un HTTP 500 arrête cette tâche.

- [x] **Step 2: Exécuter l’acceptance locale de sécurité**

Run:

```powershell
make security
```

Expected: retour 0 et huit rapports (`filesystem`, `config`, `image-backend`, `image-frontend`,
chacun en texte et SARIF). Le cache et les rapports restent ignorés par Git.

- [x] **Step 3: Traiter un éventuel gate rouge sans improviser d’ignore**

Si Step 2 échoue, exécuter uniquement :

```powershell
rg -n 'HIGH|CRITICAL|CVE-|AVD-|Secret' reports/security/*.txt
git status -sb
```

Expected: une liste d’identifiants et de chemins, sans valeur secrète brute. Arrêter ensuite
l’implémentation et ajouter au plan une micro-tâche avec le fichier exact et la version/configuration
cible :

| Origine | Fichier autorisé pour la correction |
|---|---|
| Dépendance Maven | `backend/pom.xml` et résolution du BOM concerné |
| Dépendance npm | `frontend/package.json` et `frontend/package-lock.json` |
| Runtime backend | `backend/Dockerfile` avec tag/digest Temurin corrigé |
| Runtime frontend | `frontend/Dockerfile` avec tag/digest Nginx corrigé |
| Docker/Compose/Actions | le fichier exact cité dans le rapport |
| Secret réel | le fichier exact, puis rotation hors Git avant toute poursuite |
| Faux positif démontré | `.trivyignore.yaml` et registre `docs/devops/trivy.md`, après approbation |

Aucune mise à jour de dépendance, de digest ou d’ignore n’est préautorisée par ce tableau.

Micro-tâche fondée sur la baseline du 29 août 2026 :

- `backend/pom.xml` : surcharger la propriété officielle Spring Boot `postgresql.version` de
  42.7.11 vers 42.7.12 pour corriger `CVE-2026-54291` ;
- `backend/Dockerfile` : mettre à niveau les paquets runtime Alpine `libcrypto3`, `libssl3` et
  `openssl` vers les versions corrigées disponibles dans Alpine 3.24 ;
- `frontend/Dockerfile` : passer de Nginx unprivileged 1.29.4 à l’image multiarchitecture
  `1.31.3-alpine3.24@sha256:f972e5322b9797dc2a6b830030094426437b1ae7032e4644496395336ac6fdac`,
  puis mettre à niveau `libcrypto3` et `libssl3` ;
- reconstruire, rejouer les quatre surfaces et n’ajouter aucun ignore.

- [x] **Step 4: Confirmer l’absence d’artefacts suivis**

Run:

```powershell
git status --short --ignored
git check-ignore reports/security .trivycache .m2
```

Expected: les trois répertoires sont ignorés ; aucun rapport ni cache n’est indexé.

---

### Task 7: Documentation et état réel du dépôt

**Files:**
- Create: `docs/devops/trivy.md`
- Modify: `docs/devops/github-actions.md`
- Modify: `docs/README.md:6-44`
- Modify: `README.md:7-14,87-108`
- Modify: `AGENTS.md:14-56,160-168`
- Modify: `docs/IMPLEMENTATION_PLAN.md:36-81,569-602`

**Interfaces:**
- Consumes: commandes et résultats réels des Tasks 1 à 6.
- Produces: guide exploitable, inventaire CI à jour et plan directeur fidèle à l’état validé.

- [x] **Step 1: Créer le guide d’exploitation Trivy**

Créer `docs/devops/trivy.md` avec exactement ces sections :

```markdown
# Scans de sécurité Trivy

## Périmètre et politique
## Versions et provenance
## Prérequis
## Commandes locales
## Rapports et quality gate de sécurité
## GitHub Actions et cadence hebdomadaire
## SARIF et Code Scanning optionnel
## Politique d’exception
## Mise à jour de Trivy et des bases
## Dépannage
```

Sous ces sections, documenter les quatre surfaces, les cinq cibles Make, les deux images/digests,
les sévérités, `--ignore-unfixed`, la rétention 14 jours, `ENABLE_CODE_SCANNING`, la restriction
Dependabot/forks et les diagnostics signature/base/socket/image absente. Les exemples n’emploient
que des noms de variables ou des digests publics, jamais une valeur secrète.

- [x] **Step 2: Mettre à jour la documentation GitHub Actions**

Dans `docs/devops/github-actions.md` :

- ajouter `Security` avec dépôt/IaC, rapports texte/SARIF 14 jours ;
- remplacer l’artefact Docker `aucune image publiée` par les rapports Trivy des deux images ;
- expliquer `actions: read`, `contents: read` et `security-events: write` ;
- préciser que l’upload Code Scanning est inactif tant que `ENABLE_CODE_SCANNING` n’est pas `true` ;
- conserver la preuve historique de la PR #6 comme preuve antérieure, sans lui attribuer Trivy.

- [x] **Step 3: Actualiser les index et commandes principales**

Dans `README.md`, remplacer « Trivy reste planifié » par une phrase uniquement après réussite de
Task 6, ajouter `make trivy-verify`, `make trivy-fs`, `make trivy-config`, `make trivy-images` et
`make security`, puis lier `docs/devops/trivy.md`.

Dans `docs/README.md`, ajouter le guide Trivy à la table `Disponible` et remplacer l’entrée texte
planifiée de la section DevOps par un lien Markdown actif.

- [x] **Step 4: Actualiser les instructions agents**

Dans `AGENTS.md` :

- déplacer Trivy 0.73.0 dans la stack implémentée ;
- laisser JFrog dans la cible planifiée ;
- ajouter les cinq cibles Make à la liste réellement disponible ;
- ajouter un paragraphe pointant vers `docs/devops/trivy.md` et rappelant la politique
  `HIGH/CRITICAL` corrigible pour les vulnérabilités.

- [x] **Step 5: Actualiser le plan directeur sans anticiper l’acceptance**

Dans `docs/IMPLEMENTATION_PLAN.md` :

- remplacer Trivy 0.72.0 par 0.73.0 dans le socle et la phase 8 ;
- mettre à jour la commande `trivy config infrastructure` en scan de la racine, puisque
  `infrastructure/` n’existe pas encore ;
- cocher les tâches d’implémentation seulement si leurs commandes ont réellement réussi ;
- laisser les critères d’acceptation ouverts jusqu’à Task 8.

- [x] **Step 6: Vérifier les affirmations et les liens**

Run:

```powershell
rg -n "0\.72\.0|Trivy.*planifi|docker-images\.yml|trivy config infrastructure" README.md AGENTS.md docs/README.md docs/devops docs/IMPLEMENTATION_PLAN.md
rg -n "docs/devops/trivy|devops/trivy" README.md docs/README.md AGENTS.md
git diff --check
```

Expected: aucune référence obsolète de phase 8 ; les trois liens vers le guide existent ; aucun
problème de whitespace.

- [x] **Step 7: Commit conditionnel de la documentation**

Uniquement après autorisation explicite :

```powershell
git add -- README.md AGENTS.md docs/README.md docs/devops/trivy.md docs/devops/github-actions.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document Trivy security scanning"
```

Non exécuté : aucun commit d’implémentation supplémentaire n’est autorisé à ce stade.

---

### Task 8: Acceptance gate et clôture locale de la phase 8

**Files:**
- Modify after all checks pass: `docs/IMPLEMENTATION_PLAN.md:576-600`
- Modify: `docs/superpowers/plans/2026-08-29-trivy-security.md` checkboxes and execution status
- No generated reports committed.

**Interfaces:**
- Consumes: tous les targets, workflows, rapports et documents de la phase.
- Produces: preuves locales complètes et état final sans affirmation distante non vérifiée.

- [x] **Step 1: Exécuter les validations statiques**

Run:

```powershell
make ci-lint
docker compose config --quiet
git diff --check
rg -n "uses: [^@]+@(v|main|master|latest)" .github/workflows
```

Expected: actionlint, Compose et whitespace réussissent ; la recherche de références d’action
mobiles ne retourne aucun résultat.

- [x] **Step 2: Rejouer l’acceptance locale complète**

Run:

```powershell
make security
```

Expected: signature valide, Trivy 0.73.0, dépôt/IaC sans gate rouge, deux images reconstruites et
scannées sans gate rouge.

- [x] **Step 3: Vérifier les huit rapports et leur exclusion Git**

Run:

```powershell
$expectedReports = @(
  'filesystem.txt', 'filesystem.sarif',
  'config.txt', 'config.sarif',
  'image-backend.txt', 'image-backend.sarif',
  'image-frontend.txt', 'image-frontend.sarif'
)
$expectedReports | ForEach-Object {
  $path = Join-Path 'reports/security' $_
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing $path" }
  if ((Get-Item -LiteralPath $path).Length -eq 0) { throw "Empty $path" }
}
git check-ignore reports/security .trivycache .m2
```

Expected: les huit fichiers existent, sont non vides et leurs répertoires sont ignorés.

- [x] **Step 4: Vérifier les contrats documentés**

Run:

```powershell
rg -n "0\.73\.0|HIGH|CRITICAL|ENABLE_CODE_SCANNING|14 jours|trivy-verify|trivy-images" docs/devops/trivy.md README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md
rg -n "\.trivyignore\.yaml" docs/devops/trivy.md docs/IMPLEMENTATION_PLAN.md
```

Expected: versions, gate, SARIF optionnel, rétention, commandes et politique d’exception sont
documentés aux emplacements attendus.

- [x] **Step 5: Marquer la phase terminée uniquement après les preuves**

Cocher les critères de la phase 8 et ajouter au plan d’exécution une section datée contenant les
versions réellement affichées et les codes retour des Steps 1 à 4. Ne pas cocher la publication
Code Scanning ni un run GitHub Actions si ces services n’ont pas été exécutés.

**Preuves locales du 29 août 2026 :**

- Step 1 : code retour final 0 avec actionlint 1.7.12, Docker 29.7.2, Docker Compose 5.1.0,
  `git diff --check` et aucune référence d’action mobile. La première validation Compose a retourné
  1 faute de deux variables factices ; la relance avec toutes les variables obligatoires a réussi ;
- Step 2 : `make security` retourne 0, la signature Cosign est valide et Trivy affiche 0.73.0 ;
- Step 3 : code retour 0, les huit rapports existent, sont non vides et les trois répertoires sont
  ignorés ;
- Step 4 : code retour 0, versions, gate, rétention, activation SARIF et politique d’exception sont
  présents dans la documentation.

Validation applicative complémentaire : Maven `clean verify` retourne 0 sous Java 25.0.4.1 avec
110 tests ; le frontend exécuté dans l’image Node 24.18.0 épinglée retourne 0 pour `npm ci`, ESLint,
105 tests Vitest avec couverture et le build Angular. Sous GNU Make 3.81/PowerShell, `make test`
n’atteint pas Maven car son target historique appelle le wrapper Unix `./mvnw` ; les commandes
natives documentées ont donc servi de preuve.

- [x] **Step 6: Vérifier le périmètre Git final**

Run:

```powershell
git status -sb
git diff --stat
git diff --check
git diff -- . ':!task_plan.md' ':!findings.md' ':!progress.md'
```

Expected: uniquement les fichiers Phase 8 prévus ; aucun rapport, cache, secret ou changement
utilisateur sans rapport.

- [x] **Step 7: Commit final conditionnel**

Uniquement après autorisation explicite, indexer exactement les fichiers Phase 8 restants :

```powershell
git add -- trivy.yaml .gitignore Makefile .github/workflows/security.yml .github/workflows/docker.yml backend/Dockerfile backend/pom.xml frontend/Dockerfile README.md AGENTS.md docs/README.md docs/devops/trivy.md docs/devops/github-actions.md docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-28-trivy-security-design.md docs/superpowers/plans/2026-08-29-trivy-security.md
git commit -m "docs: complete phase 8 acceptance"
```

Autorisé le 29 août 2026 par le choix de publication en Pull Request ; les fichiers sont indexés
dans le commit final de la phase 8.

- [x] **Step 8: Validation GitHub distante conditionnelle**

Après autorisation séparée de push et création de PR, vérifier les jobs `Security` filesystem/IaC
et les deux jobs `Docker CI`, télécharger un artefact texte/SARIF de chaque surface et consigner les
URLs de run. Tant que ce push n’est pas autorisé, indiquer explicitement « validation distante non
exécutée ».

Validation distante exécutée le 29 août 2026 sur la
[Pull Request #18](https://github.com/mouhamadoulo/molo-devops-lab/pull/18) :

- [Security run 33273062143](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/33273062143) :
  scans repository et configuration réussis ; artefacts `trivy-filesystem-33273062143-1` et
  `trivy-config-33273062143-1` téléchargés et vérifiés ;
- [Docker CI run 33273062128](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/33273062128) :
  builds/scans backend et frontend réussis ; artefacts `trivy-image-backend-33273062128-1` et
  `trivy-image-frontend-33273062128-1` téléchargés et vérifiés ;
- [Backend CI run 33273062069](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/33273062069)
  et [Frontend CI run 33273062129](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/33273062129) :
  succès ;
- les quatre artefacts contiennent chacun un rapport texte et un rapport SARIF non vides ; la PR
  est `MERGEABLE` avec l’état `CLEAN`.
