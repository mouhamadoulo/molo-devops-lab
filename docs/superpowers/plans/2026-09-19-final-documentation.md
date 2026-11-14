# Documentation finale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendre le laboratoire autonome pour l'apprentissage, la démonstration et le dépannage : documents manquants consolidés, backlog Jira importable, guide Confluence, liens vérifiés en CI et validation finale depuis un clone neuf.

**Architecture:** cinq nouveaux documents Markdown sous `docs/`, deux fichiers de planification sous `docs/planning/`, une cible Make `docs-check` et un workflow `docs.yml` qui exécutent lychee hors ligne dans un conteneur épinglé. Chaque document est ajouté à l'index `docs/README.md` sous forme de lien réel, ce qui rend le contrôle des liens bloquant tant que le document n'existe pas (cycle rouge puis vert).

**Tech Stack:** Markdown, Mermaid, CSV d'import Jira Cloud, lychee 0.24.2, GNU Make, GitHub Actions, actionlint 1.7.12.

**Spec:** `docs/superpowers/specs/2026-09-19-final-documentation-design.md`

## Global Constraints

- Worktree `.worktrees/phase-14-docs`, branche `docs/phase-14-final-docs`, créée depuis `origin/main`.
- Image lychee : `lycheeverse/lychee:0.24.2@sha256:e2d19e57cf6ab037026f20b8e449a1f30d9d7f81eef4194763aab2eab20bd28d`.
- lychee en mode `--offline --include-fragments`, sur `README.md`, `AGENTS.md`, `CLAUDE.md` et `docs/**/*.md`, en excluant `docs/superpowers`.
- Aucune modification du code applicatif `backend/` ou `frontend/`.
- Aucun secret réel, licence ou identifiant réel dans les fichiers versionnés ; identifiants jetables uniquement hors dépôt.
- `README.md` reste sous 200 lignes.
- Documentation en français ; noms de fichiers, cibles Make et identifiants techniques en anglais.
- Chaque document nouveau renvoie aux guides existants au lieu de recopier leur contenu.
- Tout ce qui dépend de GitHub, Jira, Confluence ou JFrog Pro est signalé comme externe et jamais déclaré effectué sans preuve.
- Commandes Windows en PowerShell 5.1 (pas de `&&`) ; `MSYS_NO_PATHCONV=1` devant tout `docker run` rejoué sous Git Bash.
- Commits : messages courts en anglais, sans trailer `Co-Authored-By`, sans mention d'assistance IA, sans `--author`.

---

### Task 0: Fichiers de suivi

**Files:**
- Create: `task_plan.md`, `progress.md`, `findings.md` à la racine du worktree (ignorés par Git)

- [x] **Step 1: Vérifier l'isolement**

```powershell
git status --short --branch
git log --oneline -2
```

Attendu : `## docs/phase-14-final-docs...`, dernier commit `docs: add phase 14 final documentation design` (puis ce plan).

- [x] **Step 2: Créer les fichiers de suivi**

`task_plan.md` liste les tâches 1 à 10 du présent plan avec des cases, la spec et le plan en en-tête. `progress.md` et `findings.md` démarrent par un titre `Phase 14 — Documentation finale`.

- [x] **Step 3: Vérifier qu'ils sont ignorés**

```powershell
git status --short
```

Attendu : aucune ligne pour les trois fichiers.

---

### Task 1: Contrôle des liens (`docs-check`) en local et en CI

**Files:**
- Modify: `Makefile` (variables, `.PHONY`, `help`, nouvelle cible)
- Create: `.github/workflows/docs.yml`

**Interfaces:**
- Produces: `make docs-check` (sortie 0 si aucun lien relatif ou ancre cassé), job CI `Check documentation links`. Toutes les tâches suivantes utilisent cette commande comme test.

- [x] **Step 1: Prouver que lychee détecte un lien cassé**

Dans le scratchpad (hors dépôt), créer `broken.md` contenant `[absent](missing.md)` puis :

```powershell
docker run --rm -v "${PWD}:/input:ro" -w /input lycheeverse/lychee:0.24.2@sha256:e2d19e57cf6ab037026f20b8e449a1f30d9d7f81eef4194763aab2eab20bd28d --offline --no-progress --include-fragments broken.md
```

(exécuté depuis le scratchpad). Attendu : `1 Error`, code de sortie `2`. Consigner la sortie dans `progress.md`.

- [x] **Step 2: Ajouter la variable et la cible Make**

Sous `ACTIONLINT_IMAGE`, ajouter :

```make
LYCHEE_IMAGE ?= lycheeverse/lychee:0.24.2@sha256:e2d19e57cf6ab037026f20b8e449a1f30d9d7f81eef4194763aab2eab20bd28d
DOCS_FILES ?= README.md AGENTS.md CLAUDE.md 'docs/**/*.md'
```

Ajouter `docs-check` à la première ligne de `.PHONY` (après `ci-lint`), la ligne d'aide après celle de `ci-lint` :

```make
	$(info   docs-check        Check relative links and anchors in the documentation)
```

et la cible, placée juste après `ci-lint` :

```make
docs-check: ## Check relative links and anchors in the documentation
	$(DOCKER) run --rm -v "$(CURDIR):/input:ro" -w /input $(LYCHEE_IMAGE) \
		--offline --no-progress --include-fragments --exclude-path docs/superpowers \
		$(DOCS_FILES)
```

- [x] **Step 3: Ajouter le workflow**

`.github/workflows/docs.yml` :

```yaml
name: Documentation

on:
  pull_request:
    branches: [main]
    paths:
      - '**.md'
      - '.github/workflows/docs.yml'
  push:
    branches: [main]
    paths:
      - '**.md'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: docs-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  links:
    name: Check documentation links
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Check relative links and anchors
        run: make docs-check
```

- [x] **Step 4: Valider**

GNU Make est absent de l'hôte : exécuter la recette équivalente, puis `make -n docs-check` et `make help` dans le conteneur Maven épinglé avec `apt-get install -y make` (procédure de la phase 13), puis actionlint :

```powershell
docker run --rm -v "${PWD}:/input:ro" -w /input lycheeverse/lychee:0.24.2@sha256:e2d19e57cf6ab037026f20b8e449a1f30d9d7f81eef4194763aab2eab20bd28d --offline --no-progress --include-fragments --exclude-path docs/superpowers README.md AGENTS.md CLAUDE.md 'docs/**/*.md'
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
git diff --check
```

Attendu : lychee `0 Errors`, exit 0 ; actionlint sans sortie, exit 0 ; `make -n docs-check` affiche la commande `docker run` ci-dessus.

- [x] **Step 5: Commit**

```powershell
git add Makefile .github/workflows/docs.yml
git commit -m "ci: check documentation links with lychee"
```

---

### Task 2: Vue d'architecture consolidée

**Files:**
- Create: `docs/architecture/overview.md`
- Modify: `docs/README.md` (tableau « Disponible » et section « Architecture »)

**Interfaces:**
- Consumes: `make docs-check` (tâche 1).
- Produces: `docs/architecture/overview.md` avec les ancres `#composants`, `#flux-dune-requête`, `#décisions-structurantes`, référencées par les tâches 3, 5 et 8.

- [x] **Step 1: Rendre l'index exigeant (rouge)**

Dans `docs/README.md`, remplacer la liste de la section « Architecture » (quatre entrées en `code`) par :

```markdown
- [Vue d'ensemble](architecture/overview.md) — composants, flux d'une requête et décisions structurantes ;
- [Décision stockage objet](architecture/object-storage-decision.md) — AIStor Free local, licence et portabilité S3.
```

et ajouter au tableau « Disponible », avant « Décision stockage objet » :

```markdown
| [Vue d'ensemble de l'architecture](architecture/overview.md) | Composants, flux d'une requête de bout en bout et décisions structurantes |
```

- [x] **Step 2: Vérifier l'échec**

Recette `docs-check` de la tâche 1. Attendu : erreurs sur `docs/architecture/overview.md` introuvable, exit 2.

- [x] **Step 3: Écrire `docs/architecture/overview.md`**

Sections obligatoires, faits relevés dans le code et non inventés :

1. `## Composants` — tableau composant / rôle / technologie / guide : frontend Angular 22 servi par Nginx 1.31 non-root (`frontend/`, `docs/infrastructure/docker.md`) ; backend Spring Boot 4.1.1 Java 25 organisé par fonctionnalité (`identity`, `product`, `common/web`) puis par couche `api`, `application`, `domain`, `infrastructure` ; PostgreSQL 18.4 avec Flyway (`backend/src/main/resources/db/migration/`) ; AIStor Free pour les objets (`architecture/object-storage-decision.md`) ; Actuator isolé sur `8081`.
2. `## Flux d'une requête` — diagramme Mermaid `sequenceDiagram` puis texte pour : login (`POST /api/v1/auth/login`, JWT d'accès en mémoire côté Angular, refresh rotatif en cookie `HttpOnly` protégé par contrôle d'`Origin`) ; lecture/CRUD produits (contrôleur → service transactionnel → repository JPA → PostgreSQL, erreurs `ProblemDetail`) ; galerie (upload validé JPEG/PNG/WebP, métadonnées en base, objet dans AIStor, lecture par URL présignée de 5 minutes) ; suppression (événement `ObjectDeletionRequested` traité après commit, trois tentatives, reconciler des orphelins). Relire `AuthController`, `AuthCookieService`, `ProductService`, `ProductImageService`, `ObjectDeletionListener` avant d'écrire.
3. `## Rôles et accès` — `VIEWER` lecture seule, `EDITOR` écriture produits et images, `ADMIN` en plus administration des utilisateurs (vérifier dans la configuration de sécurité).
4. `## Décisions structurantes` — liste courte avec renvoi : organisation par fonctionnalité, migrations Flyway et `ddl-auto=validate`, JWT en mémoire plutôt que `localStorage`, stockage privé à URL présignée, Actuator sur port séparé, images non-root épinglées.
5. `## Environnements d'exécution` — Compose local, profils DevOps, Kubernetes Docker Desktop, avec renvoi vers `../operations/services.md` (créé tâche 4 ; lien ajouté à cette tâche-là pour garder la vérification verte).

- [x] **Step 4: Vérifier le vert**

Recette `docs-check`. Attendu : `0 Errors`.

- [x] **Step 5: Commit**

```powershell
git add docs/architecture/overview.md docs/README.md
git commit -m "docs: add the consolidated architecture overview"
```

---

### Task 3: Chaîne d'outils DevSecOps

**Files:**
- Create: `docs/devops/toolchain.md`
- Modify: `docs/README.md` (tableau « Disponible » et section « DevOps »)

**Interfaces:**
- Consumes: `docs-check`, `architecture/overview.md`.
- Produces: `docs/devops/toolchain.md`, référencé par le README (tâche 8) et le guide Confluence (tâche 7).

- [x] **Step 1: Rouge**

Dans la section « DevOps » de `docs/README.md`, remplacer `` `devops/toolchain.md` — chaîne DevSecOps et diagramme Mermaid ; `` par `[Chaîne d'outils](devops/toolchain.md) — chaîne DevSecOps et diagramme Mermaid ;` et ajouter au tableau « Disponible » : `| [Chaîne d'outils DevSecOps](devops/toolchain.md) | Diagramme de bout en bout, rôle et statut local ou externe de chaque outil |`. Lancer `docs-check` : erreur attendue sur `devops/toolchain.md`.

- [x] **Step 2: Écrire le document**

1. Diagramme Mermaid `flowchart TB` reprenant la chaîne du cahier des charges (section 25 de `Prompt-DevSecOps-Lab.md`), adapté à la réalité : `Kubernetes Docker Desktop` à la place de Minikube, `Terraform (tests simulés)`, Jira/Confluence en pointillés (externes). Classes Mermaid `local`, `external`, `licensed` avec légende.
2. Tableau outil / rôle / version / exécution (locale, GitHub, externe, licence) / guide, pour : Git, GitHub, GitHub Actions, Dependabot, SonarQube, Trivy, Docker/Compose, JFrog Artifactory OSS, Terraform, Kubernetes, Prometheus, Grafana, Loki, Alloy, Jira, Confluence. Versions copiées depuis `AGENTS.md` et `docs/IMPLEMENTATION_PLAN.md#socle-de-versions`.
3. Section `## Parcours d'une modification` : branche → PR → workflows (`backend-ci`, `frontend-ci`, `docker`, `quality`, `security`, `docs`) → fusion → publication conditionnelle Artifactory, avec renvoi à `github-actions.md`.
4. Section `## Écarts avec la cible du cahier des charges` : Minikube remplacé (aucun binaire Windows ARM64), Terraform non appliqué (licence Pro), Jira/Confluence par import manuel.

- [x] **Step 3: Vert puis commit**

`docs-check` : `0 Errors`.

```powershell
git add docs/devops/toolchain.md docs/README.md
git commit -m "docs: add the DevSecOps toolchain diagram"
```

---

### Task 4: Inventaire des services et accès

**Files:**
- Create: `docs/operations/services.md`
- Modify: `docs/README.md`, `docs/architecture/overview.md` (lien de la section « Environnements d'exécution »)

**Interfaces:**
- Produces: `docs/operations/services.md` avec l'ancre `#limites-locales-externes-et-de-licence`, résumée par le README (tâche 8).

- [x] **Step 1: Rouge**

Ajouter une section `## Opérations` à `docs/README.md` avant « Observabilité » : `- [Services et accès](operations/services.md) — URL, ports, identifiants initiaux, démarrage et nettoyage de chaque stack.` et la ligne correspondante au tableau « Disponible ». Ajouter dans `overview.md` le lien `[Services et accès](../operations/services.md)`. `docs-check` : erreur attendue.

- [x] **Step 2: Relever les faits**

```powershell
Select-String -Path docker-compose.yml,docker-compose.devops.yml -Pattern '127.0.0.1:'
Select-String -Path .env.example -Pattern 'PORT|PASSWORD|EMAIL|NAME='
Select-String -Path Makefile -Pattern '^[a-z0-9-]+-(up|down|reset|delete):'
```

- [x] **Step 3: Écrire le document**

1. `## Stacks` — tableau stack / commande de démarrage / arrêt conservant les données / réinitialisation : application (`docker compose up -d --wait`, `down`, `down -v`), `quality`, `artifacts`, `registry`, `observability`, Kubernetes (`k8s-deploy`, `k8s-delete`, `k8s-reset`).
2. `## URL et ports` — tableau service / URL hôte / variable de port / stack, pour : frontend `4200`, backend `8080`, Swagger UI, AIStor API `9000` et console `9001`, PostgreSQL `5432`, SonarQube `9000`, Artifactory `8082`, JCR `8084`, Prometheus `9090`, Grafana `3000`, Loki `3100`, Alloy `12345`, Kubernetes `8088` et `9000` par `port-forward`. Tous liés à `127.0.0.1`. Paragraphe sur les conflits du port `9000`.
3. `## Identifiants initiaux` — tableau compte / origine / comment le changer, sans aucune valeur : administrateur applicatif (`BOOTSTRAP_ADMIN_*`, créé au premier démarrage sur base vide ; changer via l'administration des utilisateurs), bases PostgreSQL (`DB_PASSWORD`, `SONAR_DB_PASSWORD`, `ARTIFACTORY_DB_PASSWORD`, `JCR_DB_PASSWORD` ; figés dans le volume au premier démarrage), AIStor (`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`), Grafana (`GRAFANA_ADMIN_PASSWORD`, figé dans le volume, renvoi à la note de `grafana.md`), SonarQube `admin`/`admin` à changer à la première connexion, Artifactory `admin`/`password` à changer à la première connexion (vérifier dans `sonarqube.md` et `jfrog-artifactory.md`), Secrets Kubernetes (`k8s-secrets`).
4. `## Limites locales, externes et de licence` — AIStor Free single-node sans SLA, Artifactory OSS sans API de configuration (Terraform non applicable), Kubernetes mono-nœud sans NodePort joignable depuis Windows, GitHub requis pour la CI, Jira/Confluence par import manuel, secrets `SONAR_TOKEN`/`JFROG_*` fournis hors Git.

- [x] **Step 4: Croiser et valider**

Comparer chaque port du tableau avec la sortie de l'étape 2 ; aucune divergence attendue. `docs-check` : `0 Errors`.

- [x] **Step 5: Commit**

```powershell
git add docs/operations/services.md docs/README.md docs/architecture/overview.md
git commit -m "docs: add the services, access and cleanup inventory"
```

---

### Task 5: Règles de sécurité

**Files:**
- Create: `docs/security/security-guidelines.md`
- Modify: `docs/README.md` (section « Sécurité et dépannage » et tableau)

- [x] **Step 1: Rouge**

Remplacer dans `docs/README.md` `` `security/security-guidelines.md` — secrets, images, dépendances et configuration ; `` par `[Règles de sécurité](security/security-guidelines.md) — secrets, images, dépendances et configuration ;`, ajouter la ligne au tableau. `docs-check` : erreur attendue.

- [x] **Step 2: Écrire le document**

1. `## Secrets` — tableau secret / où il vit (`.env` local, secrets GitHub, Secret Kubernetes, fichier de licence) / jamais dans Git ; `.env.example` sans valeur ; exemples Kubernetes à valeurs vides jamais appliqués ; scanner de secrets Trivy.
2. `## Images et conteneurs` — tags explicites épinglés par digest, runtimes non-root (UIDs), racine en lecture seule et capacités supprimées côté Kubernetes, `latest` interdit, provenance Trivy vérifiée par Cosign.
3. `## Dépendances` — Dependabot, gate Trivy HIGH/CRITICAL corrigibles, surcharges justifiées (Tomcat 11.0.25, Bouncy Castle 1.86 avec CVE et PR #45), règle : retirer une surcharge dès que le BOM ou la dépendance amont fournit la version corrigée.
4. `## Surfaces exposées` — ports liés à `127.0.0.1`, Actuator limité à `health`, `info`, `prometheus` sur `8081` non publié, CORS limité à une origine, contrôle d'`Origin` sur le refresh, cookie `HttpOnly`, proxy de socket Docker en lecture seule avec allowlist, aucun token ServiceAccount monté.
5. `## Exceptions` — renvoi à la politique d'exception de `../devops/trivy.md#politique-dexception` et aux findings Kubernetes acceptés.

- [x] **Step 3: Vert puis commit**

`docs-check` : `0 Errors`.

```powershell
git add docs/security/security-guidelines.md docs/README.md
git commit -m "docs: add the security guidelines"
```

---

### Task 6: Pannes réellement rencontrées

**Files:**
- Create: `docs/troubleshooting/common-issues.md`
- Modify: `docs/README.md`

- [x] **Step 1: Rouge**

Remplacer `` `troubleshooting/common-issues.md` — diagnostics reproductibles et solutions. `` par `[Pannes courantes](troubleshooting/common-issues.md) — diagnostics reproductibles et solutions.`, ajouter la ligne au tableau. `docs-check` : erreur attendue.

- [x] **Step 2: Rassembler les sources**

Lire `findings.md` et `progress.md` du checkout principal (historique des phases 11 à 13), les sections « Dépannage » de `docker.md`, `trivy.md`, `grafana.md`, `loki.md`, `kubernetes.md`.

- [x] **Step 3: Écrire le document**

Une section `##` par domaine (Docker Desktop et WSL2, Git Bash et Windows, Compose, application, sécurité des dépendances, Kubernetes). Chaque entrée : **Symptôme** (message exact), **Cause**, **Résolution** (commande copiable), **Preuve** (ce qu'on observe une fois résolu). Entrées obligatoires :

| Entrée | Message ou symptôme exact |
|---|---|
| WSL2 figé | `500 Internal Server Error` sur le named pipe Docker, `wsl --list --verbose` sans réponse ; reprise `Restart-Service -Name WslService -Force` en console administrateur |
| Docker Desktop non lancé | `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.` |
| Chemins convertis par Git Bash | montage `-v` ou argument `/...` réécrit en `C:/Program Files/Git/...` ; `MSYS_NO_PATHCONV=1` |
| Nom de projet Compose dérivé depuis un worktree | `devops-store_application` au lieu de `devops-store-application` ; `--project-directory` |
| Healthcheck Grafana | `grep --quiet` refusé par BusyBox ; `grep -q` |
| Refresh ou login refusé | HTTP 403 sans en-tête `Origin` égal à `CORS_ALLOWED_ORIGIN` |
| CI Trivy rouge sans changement | CVE transitive publiée après la dernière CI verte (Bouncy Castle via MinIO) ; surcharge `dependencyManagement` |
| Suppression d'un produit avec images | HTTP 500 `TransientPropertyValueException`, corrigé PR #46 (historique) |
| Kubernetes : images introuvables, `/run/secrets` en lecture seule, StatefulSet bloqué, `port-forward` perdu | renvoi à `../infrastructure/kubernetes.md#pannes-rencontrées` avec une ligne de résumé chacune |

- [x] **Step 4: Vert puis commit**

`docs-check` : `0 Errors` (l'ancre `#pannes-rencontrées` doit exister dans `kubernetes.md`).

```powershell
git add docs/troubleshooting/common-issues.md docs/README.md
git commit -m "docs: add the troubleshooting guide"
```

---

### Task 7: Backlog Jira et guide Confluence

**Files:**
- Create: `docs/planning/jira-backlog.csv`, `docs/planning/jira-confluence.md`
- Modify: `docs/README.md` (nouvelle section « Planification »), `docs/IMPLEMENTATION_PLAN.md` (section « Backlog Jira proposé » : renvoi au CSV)

**Interfaces:**
- Produces: CSV à 7 colonnes `Issue Id,Parent,Issue Type,Summary,Description,Labels,Status`.

- [x] **Step 1: Écrire le test de structure (rouge)**

Dans le scratchpad, `check_backlog.py` :

```python
import csv, sys
path = sys.argv[1]
with open(path, encoding="utf-8", newline="") as handle:
    rows = list(csv.DictReader(handle))
expected = ["Issue Id", "Parent", "Issue Type", "Summary", "Description", "Labels", "Status"]
assert list(rows[0].keys()) == expected, rows[0].keys()
ids = {row["Issue Id"] for row in rows}
assert len(ids) == len(rows), "duplicate Issue Id"
epics = [row for row in rows if row["Issue Type"] == "Epic"]
assert len(epics) == 8, len(epics)
for row in rows:
    assert row["Issue Type"] in {"Epic", "Story", "Task", "Bug"}, row
    assert row["Status"] in {"To Do", "In Progress", "Done"}, row
    if row["Issue Type"] == "Epic":
        assert row["Parent"] == "", row
    else:
        assert row["Parent"] in {epic["Issue Id"] for epic in epics}, row
    assert row["Summary"] and row["Description"], row
print(f"{len(rows)} rows, {len(epics)} epics, all parents resolved")
```

Lancer `python check_backlog.py docs/planning/jira-backlog.csv` : échec attendu (fichier absent).

- [x] **Step 2: Écrire le CSV**

`docs/planning/jira-backlog.csv`, UTF-8 sans BOM, fins de ligne LF :

```csv
Issue Id,Parent,Issue Type,Summary,Description,Labels,Status
1,,Epic,EPIC-1 Application Fullstack,"Catalogue produits Angular et Spring Boot sécurisé, galerie d'images et administration.",epic,Done
2,,Epic,EPIC-2 Containerisation,Images non-root et stack locale Docker Compose en une commande.,epic,Done
3,,Epic,EPIC-3 CI/CD,Workflows GitHub Actions et construction des images.,epic,Done
4,,Epic,EPIC-4 Quality & Security,Quality gate SonarQube et scans Trivy bloquants.,epic,Done
5,,Epic,EPIC-5 Artifact Management,Artefacts Maven versionnés dans JFrog Artifactory OSS.,epic,Done
6,,Epic,EPIC-6 Infrastructure,Configuration Terraform des repositories JFrog.,epic,In Progress
7,,Epic,EPIC-7 Kubernetes,Déploiement Kubernetes local de la stack applicative.,epic,Done
8,,Epic,EPIC-8 Observability,"Métriques, dashboards et journaux centralisés.",epic,Done
101,1,Story,DEVOPS-1 Initialiser Spring Boot et PostgreSQL,"Java 25, Spring Boot 4.1, Flyway et Testcontainers. Plan : phase 1 ; PR #1.",phase-1,Done
102,1,Story,DEVOPS-2 Implémenter l'API Products,"CRUD versionné /api/v1/products, ProblemDetail, tri validé. Plan : phase 1 ; PR #1.",phase-1,Done
103,1,Story,DEVOPS-3 Initialiser Angular 22,"Standalone, OnPush, session par Signals. Plan : phase 2 ; PR #1.",phase-2,Done
104,1,Story,DEVOPS-4 Créer l'UI catalogue,"Catalogue responsive et formulaires produits. Plan : phase 2 ; PR #1.",phase-2,Done
105,1,Story,Identité JWT et RBAC,"Login, refresh rotatif, rôles VIEWER, EDITOR et ADMIN. PR #1.",phase-2,Done
106,1,Story,Galerie privée d'images produits,"Upload validé, stockage AIStor, URL présignées, suppression après commit. PR #2.",phase-2,Done
107,1,Story,Administration des utilisateurs,Console réservée au rôle ADMIN. PR #3.,phase-2,Done
108,1,Story,Tests et couverture,"JaCoCo, LCOV, scénarios critiques. Plan : phase 3 ; PR #4.",phase-3,Done
109,1,Story,Documentation finale,"Documents consolidés, backlog Jira, guide Confluence, validation depuis un clone neuf. Plan : phase 14.",phase-14,Done
201,2,Story,DEVOPS-5 Dockeriser le backend,Build Maven JDK 25 et runtime JRE 25 non-root. Plan : phase 4 ; PR #5.,phase-4,Done
202,2,Story,DEVOPS-6 Dockeriser le frontend,Build Node 24 et runtime Nginx non-root. Plan : phase 4 ; PR #5.,phase-4,Done
203,2,Story,DEVOPS-11 Stack Docker Compose,"Nginx, backend, PostgreSQL et AIStor avec healthchecks. Plan : phase 4 ; PR #5.",phase-4,Done
301,3,Story,DEVOPS-7 Configurer GitHub Actions,"Workflows backend et frontend, actions épinglées, Dependabot. Plan : phase 6 ; PR #6.",phase-6,Done
302,3,Story,DEVOPS-12 Construire les images en CI,Workflow docker. Plan : phase 6 ; PR #6.,phase-6,Done
401,4,Story,DEVOPS-8 Intégrer SonarQube,"Profil qualité local, analyses backend et frontend. Plan : phase 7 ; PR #16.",phase-7,Done
402,4,Story,DEVOPS-9 Intégrer Trivy,"Scans dépôt, configurations et images, SARIF. Plan : phase 8 ; PR #18.",phase-8,Done
403,4,Bug,CVE Bouncy Castle transitive,"bcprov-jdk18on 1.84 via MinIO (CVE-2026-8763, CVE-2026-13506), forcé en 1.86. PR #45.",security,Done
501,5,Story,DEVOPS-10 Configurer JFrog Artifactory,"Artifactory OSS et PostgreSQL 17, cinq repositories Maven. Plan : phase 9 ; PR #20.",phase-9,Done
502,5,Story,DEVOPS-13 Publier les artefacts Maven,"Snapshot, candidate, promotion par checksum. Plan : phase 9 ; PR #20.",phase-9,Done
601,6,Story,DEVOPS-14 Décrire JFrog avec Terraform,"Provider JFrog 12.11.3, tests simulés. Plan : phase 10 ; PR #21.",phase-10,Done
602,6,Task,Appliquer Terraform sur Artifactory Pro,"Import, apply, plan vide et destroy ; exige une licence Pro. Plan : phase 10.",phase-10,To Do
701,7,Story,DEVOPS-15 Manifests Kubernetes et probes,"Docker Desktop Kubernetes, StatefulSets, Secrets hors Git. Plan : phase 13 ; PR #44.",phase-13,Done
702,1,Bug,Suppression d'un produit avec images,"HTTP 500 TransientPropertyValueException, images supprimées avant le produit. PR #46.",bug,Done
801,8,Story,DEVOPS-16 Prometheus et Grafana,"Scrape interne, dashboard provisionné. Plan : phase 11 ; PR #29.",phase-11,Done
802,8,Story,DEVOPS-17 Loki et Grafana Alloy,"Journaux Docker via proxy de socket restreint. Plan : phase 12 ; PR #43.",phase-12,Done
803,8,Bug,Contrôle du mot de passe Grafana,Mot de passe exigé seulement au démarrage de Grafana. PR #42.,bug,Done
```

- [x] **Step 3: Vert du test de structure**

`python check_backlog.py docs/planning/jira-backlog.csv`. Attendu : `34 rows, 8 epics, all parents resolved`.

- [x] **Step 4: Écrire `docs/planning/jira-confluence.md`**

1. `## Jira` — prérequis (projet logiciel, clé `DEVOPS` conseillée, droits d'import) ; procédure d'import CSV natif de Jira Cloud (Paramètres système → Import externe → CSV, encodage UTF-8, séparateur virgule) ; correspondance : `Issue Id` → *Issue Id*, `Parent` → *Parent*, `Issue Type` → *Issue Type*, `Summary`, `Description`, `Labels`, `Status` → *Status* avec mappage des valeurs `To Do`, `In Progress`, `Done` ; contrôle après import : 34 éléments, 8 epics, chaque story rattachée, 1 élément `To Do`. Mention explicite : non exécuté faute de compte, étape externe.
2. `## Confluence` — arborescence de pages (Accueil = `docs/README.md`, puis Architecture, DevOps, Infrastructure, Opérations, Observabilité, Sécurité, Dépannage, Planification, une page par fichier) ; procédure de copie (coller le Markdown dans l'éditeur, qui le convertit ; remplacer les liens relatifs par des liens de page ; Mermaid par une macro ou une application Mermaid, sinon une capture) ; ordre de mise à jour quand un document change.

- [x] **Step 5: Index et plan**

`docs/README.md` : section `## Planification` avec les deux fichiers en liens, et lignes au tableau. `docs/IMPLEMENTATION_PLAN.md` : sous le tableau « Backlog Jira proposé », ajouter `Le backlog importable réel est [docs/planning/jira-backlog.csv](planning/jira-backlog.csv) ; procédure dans [Jira et Confluence](planning/jira-confluence.md).` `docs-check` : `0 Errors`.

- [x] **Step 6: Commit**

```powershell
git add docs/planning docs/README.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: add the importable Jira backlog and Confluence guide"
```

---

### Task 8: README racine et instructions agents

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/README.md` (retrait de toute entrée restante non créée)

- [x] **Step 1: README**

- Section « Documentation » : ajouter en tête `[Vue d'ensemble](docs/architecture/overview.md)`, `[Chaîne d'outils](docs/devops/toolchain.md)`, `[Services et accès](docs/operations/services.md)`, `[Pannes courantes](docs/troubleshooting/common-issues.md)`, et `[Kubernetes local](docs/infrastructure/kubernetes.md)` (absent aujourd'hui).
- Nouvelle section courte `## Limites` (3 à 5 puces) résumant `services.md#limites-locales-externes-et-de-licence`.
- Remplacer le tableau « URL locales » par les quatre URL applicatives et un renvoi vers `services.md` pour les profils.
- Ajouter `make docs-check` et `make k8s-deploy` à « Commandes principales ».
- Mettre à jour le paragraphe d'état : phase 14.

- [x] **Step 2: AGENTS.md**

Ajouter `docs-check` à la liste des cibles Make ; dans « Lint et formatage », documenter `make docs-check` comme contrôle disponible (lychee hors ligne, liens relatifs et ancres) ; dans « Documentation », règle : tout document annoncé dans l'index est un lien réel vérifié par `docs-check`.

- [x] **Step 3: Vérifier**

```powershell
(Get-Content README.md | Measure-Object -Line).Lines
git grep -n '`[a-z/]*\.md` —' -- docs/README.md
git diff --check
```

Attendu : moins de 200 lignes ; aucune entrée d'index en `code` restante ; `docs-check` `0 Errors`.

- [x] **Step 4: Commit**

```powershell
git add README.md AGENTS.md docs/README.md
git commit -m "docs: link the final documentation from the README and agent guide"
```

---

### Task 9: Validation depuis un clone neuf

**Files:**
- Modify: selon frictions trouvées (`README.md` ou documents concernés)
- Modify: `progress.md`, `findings.md` (ignorés)

- [x] **Step 1: Clone neuf hors dépôt**

```powershell
$clone = Join-Path $env:TEMP 'devops-store-clean'
if (Test-Path $clone) { Remove-Item -Recurse -Force $clone }
git clone --branch docs/phase-14-final-docs (Resolve-Path .).Path $clone
Set-Location $clone
```

- [x] **Step 2: Suivre uniquement le README**

Copier `.env.example` vers `.env` ; générer les secrets jetables hors dépôt (jamais affichés) ; renseigner `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` et `MINIO_LICENSE_FILE`. Arrêter au préalable toute stack ou redirection occupant `4200`, `8080`, `9000`, `9001`, `5432`. Puis exactement les commandes du Quick Start :

```powershell
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
docker compose ps
```

Attendu : quatre services `healthy`.

- [x] **Step 3: Parcours réel**

Via `http://localhost:4200` avec `Origin: http://localhost:4200` : login de l'administrateur bootstrap (200), `GET /api/v1/products` (200), création d'un produit (201), upload d'une image PNG (201), suppression du produit (204), puis `GET` de ce produit (404).

- [x] **Step 4: Nettoyer et consigner**

```powershell
docker compose down -v
Set-Location -
Remove-Item -Recurse -Force $clone
```

Chaque friction du README (étape manquante, commande fausse, variable non documentée) est corrigée dans le worktree, consignée dans `findings.md`, puis commitée : `git commit -m "docs: fix README steps found from a clean clone"`. Si aucune friction, le noter dans `progress.md`.

---

### Task 10: Validation finale, preuves et livraison

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (phase 14, état du dépôt), `docs/superpowers/plans/2026-09-19-final-documentation.md` (cases)

- [x] **Step 1: Validations complètes**

Depuis le worktree, sorties réelles copiées dans `progress.md` :

```powershell
Set-Location backend
.\mvnw.cmd clean verify
Set-Location ..\frontend
npm ci
npm run lint
npm run test:ci
npm run build
Set-Location ..
docker compose config --quiet
docker compose -f docker-compose.devops.yml --profile quality config --quiet
docker compose -f docker-compose.devops.yml --profile artifacts config --quiet
docker compose -f docker-compose.devops.yml --profile registry config --quiet
docker compose -f docker-compose.devops.yml --profile observability config --quiet
terraform -chdir=infrastructure/terraform init -backend=false
terraform -chdir=infrastructure/terraform fmt -check -recursive
terraform -chdir=infrastructure/terraform validate
terraform -chdir=infrastructure/terraform test
git diff --check
```

Backend avec `JAVA_HOME` sur le JDK 25 et `MINIO_LICENSE_FILE` défini ; Compose avec valeurs factices en mémoire si `.env` absent.

- [x] **Step 2: Kubernetes**

`k8s-cluster`, `k8s-config`, `k8s-images` (après `docker compose build`), `k8s-secrets` avec secrets jetables hors dépôt, `k8s-deploy`, `k8s-rollout`, `k8s-status` (quatre pods `Ready`), puis `k8s-reset`. Recettes exécutées directement si GNU Make est absent.

- [x] **Step 3: Liens**

`docs-check` hors ligne : `0 Errors`. Puis une passe en ligne unique, sans `--offline`, consignée ; chaque URL externe en échec est corrigée ou justifiée (limitation de débit, authentification) dans `findings.md`.

- [x] **Step 4: Mettre à jour le plan d'implémentation**

Phase 14 : cocher les neuf cases d'implémentation et les quatre critères avec une preuve en ligne chacun ; la case « Créer les documents architecture, DevOps, infrastructure, observabilité et sécurité » précise la consolidation. Ajouter `**Statut :** implémentée et validée depuis un clone neuf le <date>.`. Mettre à jour « État du dépôt » (date, documentation finale). Phase 10 inchangée (partielle). Cocher les étapes exécutées du présent plan, laisser ouvertes celles de push/PR/CI.

- [x] **Step 5: Revue du diff**

```powershell
git diff origin/main --stat
git diff origin/main --name-only
```

Attendu : aucun fichier sous `backend/` ou `frontend/`, aucun secret, licence ou fichier généré.

- [x] **Step 6: Commit des preuves**

```powershell
git add docs/IMPLEMENTATION_PLAN.md docs/superpowers/plans/2026-09-19-final-documentation.md
git commit -m "docs: record phase 14 acceptance evidence"
```

- [ ] **Step 7: Pousser et ouvrir la Pull Request**

Uniquement après autorisation explicite :

```powershell
git push -u origin docs/phase-14-final-docs
gh pr create --base main --title "docs: complete the final lab documentation" --body-file <fichier hors dépôt>
```

Corps : périmètre (documents consolidés, planification, `docs-check`), preuves du clone neuf et des validations, étapes externes non effectuées (import Jira/Confluence, apply Terraform Pro).

- [ ] **Step 8: Attendre la CI**

```powershell
gh pr checks --watch
```

Attendu : tous les contrôles verts, dont `Check documentation links`. Fusion, suppression de branche et du worktree uniquement sur autorisation explicite.
