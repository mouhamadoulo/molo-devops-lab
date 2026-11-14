# Design — Documentation finale du laboratoire

- **Date :** 19 septembre 2026
- **Statut :** validé en conversation, section par section
- **Périmètre :** phase 14, documentation finale, backlog Jira, guide Confluence, vérification des
  liens et validation finale de bout en bout depuis un clone neuf

## Contexte

Les phases 1 à 13 sont fusionnées sur `main` (PR #1 à #46). La phase 10 reste partielle : la
configuration Terraform est validée par tests simulés, mais son application réelle exige une licence
Artifactory Pro. Chaque phase a produit son propre guide (`docs/devops/*`, `docs/infrastructure/*`,
`docs/observability/*`).

`docs/README.md` annonce pourtant sept documents qui n'existent pas : `architecture/overview.md`,
`architecture/frontend.md`, `architecture/backend.md`, `architecture/data-flow.md`,
`devops/toolchain.md`, `security/security-guidelines.md` et `troubleshooting/common-issues.md`. Le
cahier des charges impose `docs/devops/toolchain.md` et un backlog Jira, demande que `docs/` puisse
servir de base à Confluence, et interdit de créer un fichier « uniquement parce qu'il est souvent
présent ».

Aucun outil ne vérifie aujourd'hui les liens de la documentation.

## Décisions

1. **Consolider plutôt que tout écrire.** Seuls les documents qui apportent une information absente
   ailleurs sont créés. `frontend.md`, `backend.md` et `data-flow.md` sont fusionnés dans
   `architecture/overview.md` ; l'index est corrigé en conséquence.
2. **Backlog Jira en CSV importable**, sans API ni compte : `docs/planning/jira-backlog.csv`.
3. **Confluence par copie manuelle guidée**, sans script d'export ni appel d'API.
4. **Liens vérifiés par lychee 0.24.2 en mode hors ligne**, dans un conteneur épinglé par digest,
   exposé par une cible Make et un workflow CI dédié.
5. **Validation finale depuis un clone neuf en suivant uniquement le README**, puis la validation
   complète ; les profils SonarQube et Artifactory ne sont validés que par `config`.

## Ensemble documentaire

| Document | Contenu | Statut |
|---|---|---|
| `docs/architecture/overview.md` | Composants (Angular/Nginx, Spring Boot organisé par fonctionnalité, PostgreSQL, AIStor), flux d'une requête de bout en bout (login JWT et refresh rotatif, CRUD produits, galerie à URL présignées, suppression après commit), décisions structurantes avec liens vers les guides existants | nouveau, remplace quatre entrées annoncées |
| `docs/devops/toolchain.md` | Diagramme Mermaid de la chaîne complète : Jira/Confluence → Git → GitHub → GitHub Actions → tests, SonarQube, Trivy → Docker → JFrog → Terraform / Kubernetes → Prometheus, Loki → Grafana ; chaque étape marquée locale, externe ou sous licence | nouveau, imposé |
| `docs/operations/services.md` | Inventaire unique : pour chaque stack, services, URL et port hôte, identifiant initial et moyen de le changer, commandes de démarrage, d'arrêt et de nettoyage (volumes, PVC), conflits de ports | nouveau |
| `docs/security/security-guidelines.md` | Emplacement de chaque secret et règle « jamais dans Git », images non-root épinglées par digest, politique Trivy et exceptions, surfaces exposées (Actuator `8081`, proxy de socket Docker, NodePorts), dépendances surchargées (Tomcat, Bouncy Castle) | nouveau |
| `docs/troubleshooting/common-issues.md` | Pannes réellement rencontrées au format symptôme → cause → résolution → preuve | nouveau |
| `docs/planning/jira-backlog.csv` | Backlog importable | nouveau |
| `docs/planning/jira-confluence.md` | Guide d'import Jira et d'organisation Confluence | nouveau |

Les pannes documentées dans `common-issues.md` sont celles des fichiers de suivi et des guides :
gel WSL2 et reprise élevée, pipe Docker Desktop absent, conversion de chemins Git Bash
(`MSYS_NO_PATHCONV`), dérive du nom de projet Compose depuis un worktree, healthcheck Grafana et
`grep` BusyBox, HTTP 403 sans en-tête `Origin`, CVE transitives (Tomcat, Bouncy Castle),
`port-forward` perdu après suppression de pod, Secret monté sur `/run/secrets` en racine lecture
seule, StatefulSet bloqué en `OrderedReady`, images absentes du magasin containerd. Chaque entrée
renvoie au guide détaillé quand il existe au lieu de le recopier.

Hors périmètre : réécriture des guides existants, hormis les corrections trouvées pendant la
vérification ; toute modification du code applicatif.

## Jira

`docs/planning/jira-backlog.csv` suit le format d'import CSV natif de Jira Cloud :

| Colonne | Rôle |
|---|---|
| `Issue Id` | identifiant local unique, sert de référence au rattachement |
| `Parent` | `Issue Id` de l'epic parent ; vide pour un epic |
| `Issue Type` | `Epic`, `Story`, `Task` ou `Bug` |
| `Summary` | titre court |
| `Description` | une ou deux phrases et la référence (section du plan ou PR) |
| `Labels` | phase, par exemple `phase-13` |
| `Status` | `Done` pour le livré, `To Do` pour le restant |

Contenu : les huit epics EPIC-1 à EPIC-8 du plan ; les stories DEVOPS-1 à DEVOPS-17 déjà proposées ;
les livraisons réelles absentes du backlog initial (identité et RBAC, galerie d'images privée,
administration des utilisateurs, tests et couverture, documentation finale) ; l'application réelle de
Terraform sous licence Pro en `To Do` ; les bugs réellement corrigés (suppression d'un produit avec
images, PR #46 ; CVE Bouncy Castle, PR #45 ; contrôle du mot de passe Grafana, PR #42). Le CSV est
encodé en UTF-8, séparé par des virgules, avec guillemets doubles autour des champs contenant une
virgule.

## Confluence

`docs/planning/jira-confluence.md` contient :

- le guide d'import Jira : création du projet, correspondance des colonnes, statuts, contrôle après
  import (8 epics, rattachements, nombre d'éléments) ;
- l'arborescence de pages Confluence, calquée sur les dossiers de `docs/` : Architecture, DevOps,
  Infrastructure, Observabilité, Opérations, Sécurité, Dépannage, Planification, une page par
  fichier ;
- la procédure de copie : collage du Markdown dans l'éditeur Confluence, remplacement des liens
  relatifs par des liens de pages, blocs Mermaid rendus par une macro ou une application Mermaid, à
  défaut remplacés par une capture.

L'import réel dans Jira et Confluence dépend d'un compte non fourni : il est documenté comme étape
externe et n'est jamais déclaré effectué.

## Vérification des liens

- Image `lycheeverse/lychee:0.24.2@sha256:e2d19e57cf6ab037026f20b8e449a1f30d9d7f81eef4194763aab2eab20bd28d`,
  multi-architecture.
- Mode `--offline` : liens relatifs entre fichiers et ancres `#section`, sans réseau, donc
  déterministe en CI.
- Fichiers vérifiés : `README.md`, `AGENTS.md`, `CLAUDE.md` et `docs/**/*.md`. Exclusions :
  `docs/superpowers/` (historique figé), `node_modules`, `target`.
- Cible Make `docs-check` et workflow `.github/workflows/docs.yml` déclenché sur les changements de
  fichiers Markdown, avec actions épinglées par SHA et permissions en lecture seule, comme les
  workflows existants.
- Les URL externes sont vérifiées une seule fois pendant la phase, en mode en ligne, sortie
  consignée ; elles ne sont pas vérifiées en CI pour éviter les échecs dus au réseau.

Autres contrôles ponctuels : chaque commande copiable des documents créés est exécutée ou marquée
externe ; ports et versions de `services.md` croisés avec les fichiers Compose, le Makefile et les
manifests ; `README.md` reste sous 200 lignes.

## Validation finale

Depuis un clone neuf de `main` dans un dossier temporaire hors dépôt, en suivant uniquement
`README.md` :

1. copie de `.env.example` vers `.env`, secrets jetables générés hors dépôt, licence AIStor locale ;
2. `docker compose build --pull`, `docker compose up -d --wait`, `docker compose ps` : quatre
   services sains ;
3. parcours réel : login de l'administrateur bootstrap, liste des produits, création, envoi d'une
   image, suppression ;
4. toute friction du README est corrigée dans la PR et consignée.

Validation complète, sorties réelles consignées :

- backend `./mvnw clean verify` avec Java 25 et la licence AIStor ;
- frontend `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build` ;
- `docker compose config --quiet` pour l'application et pour les profils `quality`, `artifacts`,
  `registry` et `observability` ;
- Terraform `fmt -check -recursive`, `validate` et `test` ;
- Kubernetes : dry-run client et serveur, déploiement réel, rollout, puis `k8s-reset` ;
- `docs-check` et passe en ligne des URL externes ;
- `git diff --check` et actionlint sur le nouveau workflow.

`docs/IMPLEMENTATION_PLAN.md` coche la phase 14 avec une preuve par critère. Les phases 1 à 13
gardent leur statut réel : la phase 10 reste partielle et l'application Terraform sous licence Pro
reste à faire. Tout ce qui dépend de GitHub, Jira, Confluence ou JFrog Pro reste signalé comme
externe.

## Critères d'acceptation

- Depuis un clone neuf, le seul `README.md` suffit pour lancer l'application et réussir le parcours
  réel.
- `docs-check` est vert : chaque document est atteignable depuis `docs/README.md`, aucun lien relatif
  ou ancre n'est cassé, et l'index n'annonce aucun document inexistant.
- Les limites locales, externes et de licence JFrog sont listées dans `services.md` et résumées dans
  le README.
- Toutes les validations de la section précédente sont vertes, avec sorties consignées.

## Livraison

Worktree `.worktrees/phase-14-docs`, branche `docs/phase-14-final-docs`. Commits par lot :
documents, planification, outillage de vérification, preuves. Pull Request, CI verte, fusion
uniquement sur autorisation explicite.
