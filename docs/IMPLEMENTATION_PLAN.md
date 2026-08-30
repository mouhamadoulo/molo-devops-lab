# DevOps Store Implementation Plan

> **Pour les exécutants agentiques :** compétence requise `superpowers:executing-plans`.
> Exécuter ce plan phase par phase, mettre à jour les checkboxes et conserver un point de
> validation humain entre les changements d'infrastructure importants.

**Objectif :** construire un mini-catalogue Fullstack réellement exécutable servant de
laboratoire DevSecOps local et de démonstration portfolio.

**Architecture :** une SPA Angular appelle une API REST Spring Boot, elle-même connectée à
PostgreSQL. Le monorepo sépare l'application, l'infrastructure, les pipelines et la
documentation ; Docker Compose fournit les environnements locaux et Kubernetes constitue la
cible de déploiement pédagogique.

**Stack :** Angular 22, TypeScript 6, Java 25, Spring Boot 4.1, PostgreSQL 18, Docker,
GitHub Actions, SonarQube, Trivy, JFrog Artifactory, Terraform, Kubernetes et stack Grafana.

**Spécification :** [`Prompt-DevSecOps-Lab.md`](../Prompt-DevSecOps-Lab.md)

## Contraintes globales

- Le MVP contient une authentification interne et trois rôles ; il ne contient ni inscription
  publique, ni panier, ni commande, ni paiement.
- L'application reste un monolithe modulaire ; aucun microservice n'est introduit.
- Flyway est seul responsable du schéma et Hibernate utilise `ddl-auto=validate`.
- Les tests qui vérifient PostgreSQL utilisent un vrai conteneur PostgreSQL.
- Aucun secret réel, token, fichier `.env` ou manifeste Kubernetes secret n'est versionné.
- Chaque image et action CI est épinglée à une version immuable ; les actions tierces sont
  épinglées à leur SHA complet.
- Une phase ne passe à l'état terminé qu'après exécution de toutes ses validations applicables.
- Après deux échecs identiques, changer d'approche ; après trois, consigner le blocage et
  demander une décision.

---

## État du dépôt au 29 août 2026

- Le dépôt Git contient le backend, l'identité/RBAC, la galerie privée d'images produits, le CRUD
  produits Angular et l'administration des utilisateurs réservée au rôle `ADMIN`.
- Le login, la restauration de session, les guards, le shell responsive et les parcours desktop
  et mobile de la console sont implémentés.
- Docker Compose fournit Nginx, le backend, PostgreSQL et AIStor Free ; les images applicatives
  multi-stage non-root et leur démarrage ordonné sont disponibles.
- Les workflows GitHub Actions, actionlint et Dependabot sont validés localement et sur la Pull
  Request #6 ; les rapports backend et frontend sont conservés 14 jours.
- Trivy scanne le dépôt, les dépendances, les configurations et les images localement et en CI ;
  les rapports texte et SARIF sont conservés 14 jours.
- Docker 29.7.2, Docker Compose 5.1.0, Node 24.18.0, npm 11.16.0,
  Maven 3.9.13, kubectl 1.34.1 et Git 2.53.0 sont installés.
- Java 21 est installé sur l'hôte ; les builds Java 25 utilisent l'image officielle
  `maven:3.9.13-eclipse-temurin-25` compatible ARM64.
- Terraform et Minikube ne sont pas encore installés ; GNU Make 3.81 est disponible sous Windows.
- Docker fonctionne en ligne de commande, avec un avertissement d'accès au fichier de
  configuration utilisateur à recontrôler hors environnement restreint.

## Socle de versions

Les versions applicatives sont verrouillées dès leur phase. Les patchs peuvent être mis à jour
uniquement après lecture des notes de version et relance de toutes les validations.

| Outil | Version de référence | Décision de compatibilité |
|---|---:|---|
| Angular / CLI | 22.0.x | Version obligatoire ; standalone et OnPush sont les valeurs par défaut |
| TypeScript | 6.0.x | Plage imposée par Angular 22 : `>=6.0.0 <6.1.0` |
| Node.js / npm | 24.18.0 / 11.16.0 | Node satisfait le minimum Angular `^24.15.0` |
| Java | 25 LTS | Version source, cible, tests et runtime |
| Spring Boot | 4.1.0 | Supporte Java 17 à 26 et Maven 3.6.3+ |
| Maven Wrapper | 3.9.13 | Identique à l'installation locale actuelle |
| Springdoc OpenAPI | 3.0.3 | Branche 3.x compatible Spring Boot 4 |
| Testcontainers | 2.0.5 | Modules JUnit Jupiter et PostgreSQL |
| PostgreSQL | 18.4 | Version courante supportée jusqu'en 2030 |
| MinIO AIStor Free | RELEASE.2026-04-14T21-32-45Z | Single-node licencié, corrigé pour GHSA-xh8f-g2qw-gcm7 |
| Flyway | BOM Spring Boot 4.1 | Ajouter explicitement `flyway-database-postgresql` |
| SonarQube Community | 26.7.0.124771-community | Support Java 25 ; scan TypeScript 6 exigé comme test d'acceptation |
| Trivy | 0.73.0 | Image multi-architecture immuable, signature Cosign vérifiée avant les scans |
| Terraform | 1.15.4 | Version stable avec binaire Windows ARM64 |
| Provider JFrog Artifactory | 12.11.3 | Provisionnement des repositories Artifactory |
| Minikube | 1.38.1 | Cluster local ; installer avant la phase 13 |
| Kubernetes | 1.35.6 | Version active compatible avec le kubectl 1.34 local selon la règle de skew |
| Prometheus | 3.12.0 | Image distroless privilégiée |
| Grafana | 13.1.0 | Provisioning fichiers versionné |
| Loki | 3.7.2 | Mode single-binary pour le laboratoire local |
| Grafana Alloy | 1.18.0 | Collecteur moderne ; Promtail est exclu |

### Politique d'images

- Les Dockerfiles utilisent des tags explicites puis enregistrent les digests au moment du
  premier build reproductible.
- Le backend utilise un build Maven/JDK 25 et un runtime JRE 25 non-root.
- Le frontend utilise Node 24.18 pour le build et Nginx non-root pour le runtime.
- Artifactory OSS démarre d'abord avec une version 7.x explicitement vérifiée par
  `docker manifest inspect`; le tag retenu est ensuite figé dans Compose et documenté.
- Les tags `latest` sont interdits dans les fichiers versionnés.

## Décisions d'architecture

### Application

- Identifiants produit : `Long` généré par PostgreSQL.
- Prix : `BigDecimal` côté Java et `numeric(12,2)` en base.
- Dates : `Instant` côté Java et `timestamptz` en base, toujours en UTC.
- Mise à jour : `PUT` remplace l'ensemble des champs modifiables.
- Pagination : contrat stable `PageResponse<T>` plutôt que sérialisation directe de `Page`.
- Recherche : nom insensible à la casse ; catégorie et disponibilité sont combinables.
- Suppression : réponse `204 No Content` ; ressource absente : Problem Details `404`.
- Validation : nom non vide, description bornée, prix positif ou nul, stock positif ou nul.

### Frontend

- Composants standalone et stratégie OnPush implicites dans Angular 22.
- Routes produits lazy-loaded ; composants organisés par feature.
- `HttpClient` expose des Observables ; le store de feature publie des Signals.
- Les mutations ponctuelles utilisent `firstValueFrom` dans des méthodes `async` afin d'éviter
  les subscriptions manuelles persistantes.
- Les formulaires restent des Reactive Forms strictement typés, conformément au cahier des
  charges, même si Angular 22 propose aussi Signal Forms.
- Les états `loading`, `error`, `empty` et `success` sont explicites et testés.

### Backend

- Un monolithe modulaire simple : `product` contient API, application, domaine et persistance.
- Les entités JPA ne sortent jamais de la couche API ; des records portent les DTO.
- `JpaSpecificationExecutor` compose les filtres sans multiplier les méthodes repository.
- Un `@RestControllerAdvice` centralise les Problem Details RFC 9457.
- Spring Boot produit nativement des logs JSON Logstash ; le MDC porte `requestId`.
- Seuls `health`, `info` et `prometheus` sont exposés par Actuator.

### Infrastructure et DevSecOps

- `docker-compose.yml` lance PostgreSQL et AIStor Free, puis le backend sain et le frontend Nginx,
  sans stack concurrente.
- La licence AIStor Free est acceptée pour ce laboratoire single-node, montée en lecture seule et
  exclue de Git ; cette édition ne fournit ni haute disponibilité ni SLA/SLO.
- `docker-compose.devops.yml` utilise les profils `quality`, `artifacts`, `registry` et
  `observability` pour éviter de consommer toutes les ressources simultanément ; `registry` reste
  optionnel et `observability` est encore planifié.
- Terraform ne configurera les repositories JFrog qu'avec une souscription exposant les API de
  configuration ; l'édition OSS conserve la création initiale dans l'interface.
- Kubernetes utilise des YAML natifs pédagogiques, sans Helm dans le MVP.
- Artifactory OSS illustre Maven local/remote/virtual. Le registre Docker JFrog est optionnel et
  requiert JFrog Container Registry ou une édition Artifactory adaptée.

## Arborescence cible

```text
.
├── .github/
│   ├── pull_request_template.md
│   └── workflows/
│       ├── backend-ci.yml
│       ├── frontend-ci.yml
│       ├── security.yml
│       └── docker.yml
├── backend/
│   ├── .mvn/wrapper/
│   ├── src/main/java/com/molo/devopsstore/
│   │   ├── DevOpsStoreApplication.java
│   │   ├── common/
│   │   │   ├── config/
│   │   │   └── exception/
│   │   └── product/
│   │       ├── api/dto/
│   │       ├── application/
│   │       ├── domain/
│   │       └── infrastructure/
│   ├── src/main/resources/db/migration/
│   ├── src/test/java/com/molo/devopsstore/
│   ├── Dockerfile
│   ├── mvnw
│   ├── mvnw.cmd
│   └── pom.xml
├── frontend/
│   ├── src/app/
│   │   ├── core/config/
│   │   ├── shared/components/
│   │   └── features/products/
│   │       ├── components/
│   │       ├── models/
│   │       ├── pages/
│   │       ├── services/
│   │       └── products.routes.ts
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── infrastructure/
│   ├── alloy/
│   ├── grafana/{dashboards,provisioning}/
│   ├── kubernetes/{backend,frontend,postgres}/
│   ├── loki/
│   ├── prometheus/
│   └── terraform/
├── docs/
│   ├── architecture/
│   ├── devops/
│   ├── infrastructure/
│   ├── observability/
│   ├── security/
│   ├── troubleshooting/
│   ├── IMPLEMENTATION_PLAN.md
│   └── README.md
├── scripts/
├── .env.example
├── .gitignore
├── docker-compose.devops.yml
├── docker-compose.yml
├── Makefile
└── README.md
```

## Exécution locale et dépendances externes

| Capacité | Locale | Service externe requis |
|---|:---:|---|
| Frontend, backend, PostgreSQL | Oui | Non |
| Tests unitaires et Testcontainers | Oui | Non, mais Docker est requis |
| SonarQube, Trivy, JFrog Maven | Oui | Non |
| Prometheus, Grafana, Loki, Alloy | Oui | Non |
| Terraform contre JFrog local | Oui | Non |
| Kubernetes avec Minikube | Oui | Non |
| Workflows GitHub Actions | Fichiers testables partiellement | Dépôt GitHub et secrets |
| Publication Maven/images distante | Non | Instance JFrog accessible et credentials |
| Jira backlog/sprints | Documentation locale seulement | Site Jira et droits projet |
| Pages Confluence | Markdown prêt à importer | Espace Confluence et droits d'écriture |

Les appels à GitHub, Jira, Confluence ou une instance JFrog distante ne sont jamais simulés.
Leur activation exige des identifiants fournis hors Git et une autorisation explicite.

## Ports locaux réservés

| Service | Port hôte |
|---|---:|
| Frontend Nginx | 4200 |
| Backend | 8080 |
| PostgreSQL application | 5432 |
| SonarQube | 9000 |
| JFrog router / legacy | 8082 / 8081 |
| Prometheus | 9090 |
| Grafana | 3000 |
| Loki | 3100 |
| Alloy UI | 12345 |

## Backlog Jira proposé

| Epic | Résultat attendu | Stories et tâches initiales |
|---|---|---|
| EPIC-1 Application Fullstack | Catalogue fonctionnel | DEVOPS-1 backend, DEVOPS-2 API, DEVOPS-3 Angular, DEVOPS-4 UI |
| EPIC-2 Containerisation | Stack locale en une commande | DEVOPS-5 image backend, DEVOPS-6 image frontend, DEVOPS-11 Compose |
| EPIC-3 CI/CD | Contrôles automatisés | DEVOPS-7 workflows CI, DEVOPS-12 build images |
| EPIC-4 Quality & Security | Quality gate et scans | DEVOPS-8 SonarQube, DEVOPS-9 Trivy |
| EPIC-5 Artifact Management | Artefacts versionnés | DEVOPS-10 JFrog, DEVOPS-13 publication Maven |
| EPIC-6 Infrastructure | IaC reproductible | DEVOPS-14 Terraform JFrog |
| EPIC-7 Kubernetes | Déploiement Minikube | DEVOPS-15 manifests et probes |
| EPIC-8 Observability | Métriques, dashboards et logs | DEVOPS-16 Prometheus/Grafana, DEVOPS-17 Loki/Alloy |

---

## PHASE 0 — Architecture et choix techniques

**Objectif :** cadrer les versions, les limites, l'arborescence et l'ordre d'exécution avant
toute génération applicative.

**Fichiers concernés :** `Prompt-DevSecOps-Lab.md`, `README.md`, `docs/README.md`,
`docs/IMPLEMENTATION_PLAN.md`.

**Implémentation :**

- [x] Inspecter le dépôt existant sans écraser de contenu.
- [x] Vérifier Angular 22, TypeScript 6, Java 25, Spring Boot 4.1 et les outils associés.
- [x] Choisir le monolithe modulaire, les deux stacks Compose et le rôle de Terraform.
- [x] Définir l'arborescence cible, les ports et les frontières local/externe.
- [x] Créer le plan, l'index documentaire et le README racine court.

**Commandes de validation :**

```powershell
rg --files
rg "^## PHASE [0-9]+" docs/IMPLEMENTATION_PLAN.md
rg "IMPLEMENTATION_PLAN|docs/README" README.md docs/README.md
```

**Critères d'acceptation :**

- [x] Les 15 phases numérotées de 0 à 14 sont présentes.
- [x] Chaque phase possède objectif, fichiers, implémentation, validations, critères et dépendances.
- [x] Les trois documents ont des rôles distincts et ne prétendent pas que l'application existe.

**Dépendances :** aucune.

## PHASE 1 — Backend Spring Boot 4 / Java 25 / PostgreSQL

**Objectif :** livrer l'API Products complète, migrée par Flyway et observable par Actuator.

**Fichiers concernés :** `backend/pom.xml`, wrappers Maven, `backend/src/main/**`,
`backend/src/test/**`.

**Implémentation :**

- [x] Fournir JDK 25 via l'image Maven officielle et vérifier que Maven l'utilise.
- [x] Générer Spring Boot 4.1.0 avec Web MVC, Validation, Data JPA, Actuator et PostgreSQL.
- [x] Ajouter Flyway PostgreSQL, Micrometer Prometheus, Springdoc 3.0.3 et Testcontainers 2.0.5.
- [x] Écrire d'abord les tests de service pour création, mise à jour, absence et suppression.
- [x] Créer `Product`, `ProductCategory`, les records request/response et `PageResponse<T>`.
- [x] Créer repository, specifications, mapper explicite, service transactionnel et controller v1.
- [x] Implémenter CRUD, pagination, tri, recherche, catégorie et disponibilité combinables.
- [x] Ajouter `V1__create_product_table.sql` et `V2__insert_sample_products.sql`.
- [x] Centraliser les erreurs RFC 9457 et ajouter validation, CORS local restrictif et `requestId`.
- [x] Exposer uniquement health, info et prometheus ; incrémenter `products_created_events_total`
  (`_created` seul est réservé par le client Prometheus moderne).

**Commandes de validation :**

```powershell
Set-Location backend
.\mvnw.cmd clean verify
.\mvnw.cmd spring-boot:run
curl.exe http://localhost:8080/actuator/health
curl.exe "http://localhost:8080/api/v1/products?page=0&size=20&sort=name,asc"
```

**Critères d'acceptation :**

- [x] Java 25 compile tous les sources et tests sans preview feature.
- [x] Flyway crée le schéma et Hibernate le valide sans le modifier.
- [x] Les cinq endpoints répondent avec les statuts et Problem Details attendus.
- [x] Les filtres se combinent et un tri non autorisé retourne une erreur 400 maîtrisée.
- [x] Aucun controller ne contient de logique métier ni ne retourne une entité JPA.

**Dépendances :** phase 0, JDK 25, Docker pour PostgreSQL et Testcontainers.

## PHASE 2 — Frontend Angular 22

**Objectif :** livrer une interface responsive couvrant liste, détail, création, modification,
suppression et filtres.

**Fichiers concernés :** `frontend/package*.json`, `frontend/angular.json`,
`frontend/src/app/**`, `frontend/src/styles.scss`.

**Implémentation :**

- [x] Générer Angular CLI 22 sans NgModule, avec routing, SCSS, npm et sans dépôt Git imbriqué.
- [x] Activer le mode TypeScript strict et conserver le builder application esbuild.
- [x] Définir les modèles `Product`, `ProductCategory`, requests et `PageResponse<T>`.
- [x] Créer `ProductsApi` pour le contrat HTTP et `ProductsStore` pour les Signals d'état.
- [x] Lazy-loader `products.routes.ts` depuis `app.routes.ts`.
- [x] Créer pages liste, détail et formulaire, puis composants filtres, carte/table et confirmation.
- [x] Utiliser `@if`, `@for`, `@switch`, `computed` et des formulaires réactifs typés.
- [x] Implémenter états loading/error/empty/success et messages d'erreur accessibles.
- [x] Utiliser `/api` comme base relative afin que Nginx fasse le reverse proxy en production.
- [x] Ajouter des budgets de bundle et refuser les dépendances CommonJS non justifiées.
- [x] Livrer l'administration `ADMIN` des utilisateurs : liste paginée et triée, création,
  modification du nom/rôle, activation, désactivation et réinitialisation du mot de passe.

**Incrément sécurité livré :** login accessible, access token uniquement en mémoire, refresh
rotatif par cookie HttpOnly, guards d'authentification et de rôle, sidebar desktop, navigation
basse mobile et page 403. Les tests Vitest et Playwright couvrent ces parcours.

**Incrément administration livré :** `/users` est lazy-loadé et réservé à `ADMIN`. La page utilise
un store Signals, un tableau desktop, des cartes tactiles mobile et un panneau maître-détail. Les
erreurs `ProblemDetail`, l'auto-désactivation et la règle du dernier administrateur sont présentées
sans déplacer l'autorité métier hors du backend.

**Commandes de validation :**

```powershell
Set-Location frontend
npm ci
npm test -- --watch=false
npm run build
```

**Critères d'acceptation :**

- [x] Les parcours CRUD principaux fonctionnent contre l'API locale.
- [x] Recherche, catégorie, disponibilité, page et tri sont reflétés dans la requête HTTP.
- [x] Aucun `any`, NgModule, `HttpClientTestingModule` déprécié ou subscription persistante inutile.
- [x] Navigation clavier, labels, focus, contrastes et annonces d'erreur sont utilisables.

**Dépendances :** phases 0 et 1, Node 24.18 et npm 11.16.

## PHASE 3 — Tests et couverture

**Objectif :** consolider une pyramide de tests utile et produire les rapports de couverture CI.

**Fichiers concernés :** `backend/src/test/**`, `frontend/src/**/*.spec.ts`, configurations de
couverture Maven et Angular/Vitest.

**Implémentation :**

- [x] Compléter les tests unitaires `ProductService` avec Mockito et AssertJ.
- [x] Tester le controller : validation, filtres, 404, 409 éventuel et Problem Details.
- [x] Tester repository et migrations sur PostgreSQL 18 avec `@ServiceConnection` Testcontainers.
- [x] Ajouter un test d'intégration API complet sans mock de PostgreSQL.
- [x] Tester `ProductsApi` avec `provideHttpClientTesting()` après `provideHttpClient()`.
- [x] Tester store, formulaires, loading, erreur, liste vide, filtres et opérations CRUD critiques.
- [x] Produire JaCoCo XML côté backend et LCOV côté frontend sans seuil artificiel global.
- [x] Documenter les scénarios critiques non automatisés et leur justification.

**Commandes de validation :**

```powershell
.\backend\mvnw.cmd clean verify
Set-Location frontend
npm ci
npm test -- --watch=false --coverage
npm run build
```

**Critères d'acceptation :**

- [x] ProductService, ProductController et ProductRepository ont des tests pertinents.
- [x] Les tests PostgreSQL échouent clairement si Docker n'est pas accessible.
- [x] Les rapports XML/LCOV sont générés aux chemins consommés par SonarQube.
- [x] Aucun test ne dépend de l'ordre d'exécution ou d'un port hôte fixe.

**Dépendances :** phases 1 et 2.

## PHASE 4 — Docker et Docker Compose applicatif

**Objectif :** démarrer frontend, backend, PostgreSQL et AIStor avec `docker compose up -d`.

**Fichiers concernés :** configuration MinIO du backend, `backend/Dockerfile`,
`backend/.dockerignore`, `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf`,
`docker-compose.yml`, `.env.example`, `Makefile`, `README.md` et
`docs/infrastructure/docker.md`.

**Implémentation :**

- [x] Écrire les Dockerfiles multi-stage et épingler tags puis digests.
- [x] Exécuter les runtimes backend et frontend avec des utilisateurs non-root.
- [x] Configurer Nginx pour SPA, reverse proxy `/api` et headers HTTP défensifs.
- [x] Définir PostgreSQL 18.4, volume nommé, réseau privé et healthcheck `pg_isready`.
- [x] Faire dépendre le backend de PostgreSQL et AIStor sains, puis le frontend du backend sain.
- [x] Ajouter healthchecks, limites raisonnables et arrêt gracieux.
- [x] Créer `.env.example` sans secret utilisable et ignorer `.env`.
- [x] Ajouter les cibles Makefile application/test/build avec aide auto-documentée.

**Commandes de validation :**

```powershell
docker compose config
docker compose build --pull
docker compose up -d --wait
docker compose ps
curl.exe http://localhost:8080/actuator/health
curl.exe http://localhost:4200
docker compose down
```

**Critères d'acceptation :**

- [x] Les quatre services durables deviennent sains et l'initialiseur AIStor se termine avec succès.
- [x] Les migrations et données exemples sont présentes au premier démarrage.
- [x] Aucun secret ni outil de build n'est présent dans les images runtime.
- [x] Le frontend appelle l'API via Nginx sans CORS en production Compose.

**Dépendances :** phases 1 à 3, Docker Desktop disponible.

## PHASE 5 — Git et GitHub

**Objectif :** mettre en place l'historique, les conventions et le workflow de collaboration.

**Fichiers concernés :** `.gitignore`, `.gitattributes`, `.github/pull_request_template.md`,
`docs/devops/git-workflow.md`, `README.md`.

**Implémentation :**

- [x] Conserver `main` comme branche durable et utiliser des branches courtes par Pull Request.
- [x] Ignorer secrets, états Terraform, sorties de build, IDE, logs et volumes locaux.
- [x] Normaliser UTF-8 et LF, tout en conservant les scripts Windows nécessaires.
- [x] Créer un modèle PR avec tests, sécurité, documentation et rollback.
- [x] Documenter GitHub Flow, `codex/*`, `feature/*`, `fix/*`, review, merge, tag et release.
- [x] Configurer le remote GitHub uniquement quand son URL est fournie.

**Commandes de validation :**

```powershell
git status --short --branch
git check-ignore .env frontend/node_modules backend/target infrastructure/terraform/terraform.tfstate
git log --oneline --decorate -5
```

**Critères d'acceptation :**

- [x] L'historique commence par des commits intentionnels et lisibles.
- [x] Un fichier secret de test est correctement ignoré sans être ajouté à Git.
- [x] Le modèle PR permet de vérifier fonctionnel, tests, sécurité et documentation.

**Dépendances :** phase 4 ; compte/dépôt GitHub requis uniquement pour push et PR.

## PHASE 6 — GitHub Actions

**Objectif :** automatiser tests, builds et conservation des rapports avec privilèges minimaux.

**Fichiers concernés :** `.github/workflows/backend-ci.yml`, `frontend-ci.yml`, `docker.yml`,
`.github/dependabot.yml`, `Makefile`, `frontend/package.json`, `docs/devops/github-actions.md`.

**Implémentation :**

- [x] Déclencher les Pull Requests vers `main`, les pushes sur `main` et les lancements manuels
  avec des filtres de chemins pertinents.
- [x] Configurer Java 25 et cache Maven, puis exécuter `./mvnw clean verify`.
- [x] Configurer Node 24 et cache npm, puis exécuter `npm ci`, tests et build.
- [x] Uploader rapports de tests et couverture, même après un test échoué.
- [x] Construire les deux images sans publication sur les Pull Requests.
- [x] Définir `permissions: contents: read` par défaut sans élévation superflue.
- [x] Épingler toutes les actions par SHA complet avec commentaire de version.
- [x] Exécuter `actionlint` depuis une image épinglée par digest.
- [x] Activer Dependabot pour npm, Maven, GitHub Actions, Docker Compose et Docker.

**Commandes de validation :**

```powershell
rg "permissions:|uses:.*@[0-9a-f]{40}" .github/workflows
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
```

**Critères d'acceptation :**

- [x] Backend et frontend ont des jobs indépendants et reproductibles.
- [x] Aucun secret n'est disponible sur un job qui n'en a pas besoin.
- [x] Les builds locaux et CI exécutent les mêmes commandes.

**Dépendances :** phases 3 à 5 ; GitHub requis pour l'exécution hébergée.

## PHASE 7 — SonarQube

**Objectif :** analyser Java 25, TypeScript 6, tests et couverture dans une instance locale.

**Fichiers concernés :** `docker-compose.devops.yml`, `sonar-project.properties`, configurations
Maven/frontend, workflow qualité et `docs/devops/sonarqube.md`.

**Implémentation :**

- [x] Ajouter SonarQube Community 26.7 et sa base PostgreSQL dédiée au profil `quality`.
- [x] Allouer les ressources et volumes requis par Elasticsearch/SonarQube.
- [x] Créer deux projets backend/frontend documentés et reproductibles.
- [x] Importer JaCoCo XML, Surefire, LCOV et Vitest sans retirer les tests de l'analyse.
- [x] Exécuter un smoke scan réel de sources Java 25 et TypeScript 6.
- [x] Vérifier la compatibilité : SonarJS 13.1.0.42921 analyse TypeScript 6.0.3 sans changement
  d'image SonarQube.
- [x] Ajouter l'analyse CI conditionnelle à `SONAR_HOST_URL` et `SONAR_TOKEN`.
- [x] Documenter quality gate, token local, RAM et nettoyage.

**Commandes de validation :**

```powershell
docker compose -f docker-compose.devops.yml --profile quality config
docker compose -f docker-compose.devops.yml --profile quality up -d --wait
curl.exe http://localhost:9000/api/system/status
.\backend\mvnw.cmd clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar
Set-Location frontend
npm ci
npm run lint
npm run test:ci
npm run build
$env:SONAR_SCANNER_JAVA_EXE_PATH = Join-Path $env:JAVA_HOME 'bin\java.exe'
npm run sonar
```

**Critères d'acceptation :**

- [x] Les analyses Java 25 et TypeScript 6 finissent sans erreur de parsing/version.
- [x] Tests et couverture apparaissent dans SonarQube.
- [x] Token et mot de passe ne figurent dans aucun fichier suivi.

**Preuve locale du 24 août 2026 :** SonarQube 26.7.0.124771 a accepté les deux quality gates.
Le backend publie 110 tests et 87,6 % de couverture ; le frontend publie 105 tests et 89,1 % de
couverture. Sur Windows ARM64, le Scanner NPM utilise Java 25 x64 via
`SONAR_SCANNER_JAVA_EXE_PATH`, car aucun JRE embarqué ARM64 Windows n'est distribué.

**Dépendances :** phases 3, 4 et 6 ; au moins 4 Go de RAM disponibles pour SonarQube.

## PHASE 8 — Trivy

**Statut :** terminée et fusionnée dans `main` le 29 août 2026 via la
[Pull Request #18](https://github.com/mouhamadoulo/molo-devops-lab/pull/18), merge commit
`333a52a`.

**Objectif :** scanner dépôt, dépendances, secrets, images et IaC localement et dans la CI.

**Fichiers concernés :** `.github/workflows/security.yml`, `Makefile`, `.trivyignore.yaml` si une
exception justifiée existe, `docs/devops/trivy.md`.

**Implémentation :**

- [x] Conteneuriser Trivy 0.73.0 et vérifier sa signature avec Cosign.
- [x] Scanner le filesystem avec vulnérabilités, mauvaises configurations et secrets.
- [x] Scanner les deux images construites et les configurations Docker/IaC disponibles.
- [x] Générer SARIF pour GitHub et un rapport lisible comme artefact CI.
- [x] Bloquer CRITICAL/HIGH corrigibles ; documenter chaque exception avec échéance.
- [x] Épingler `trivy-action` à un SHA complet sûr, jamais à `latest`.
- [x] Ajouter les commandes Makefile et la procédure de mise à jour de la base CVE.

**Commandes de validation :**

```powershell
make trivy-verify
make trivy-fs
make trivy-config
make build
make trivy-images
make security
```

**Critères d'acceptation :**

- [x] Les quatre surfaces demandées sont scannées.
- [x] Le pipeline échoue selon une politique écrite, pas sur une configuration implicite.
- [x] Aucun ignore sans justification, propriétaire et date de révision.

**Preuve locale du 29 août 2026 :** `make security` retourne 0 avec Trivy 0.73.0, une signature
Cosign valide, huit rapports non vides et aucune vulnérabilité HIGH/CRITICAL corrigible sur le
dépôt, les Dockerfiles et les images backend/frontend. La validation applicative complémentaire
réussit avec 110 tests backend, 105 tests frontend, le lint frontend et les deux builds.

**Preuve GitHub du 29 août 2026 :** la [Pull Request #18](https://github.com/mouhamadoulo/molo-devops-lab/pull/18)
valide les six jobs backend, frontend, Security et Docker CI. Les quatre artefacts Trivy contiennent
chacun un rapport texte et un rapport SARIF non vides.

**Dépendances :** phases 4 et 6.

## PHASE 9 — JFrog Artifactory

**Objectif :** démontrer publication, résolution et promotion simple d'artefacts Maven.

**Fichiers concernés :** `docker-compose.devops.yml`, `backend/pom.xml`,
`infrastructure/jfrog/settings.xml.example`, workflow Docker/build et
`docs/devops/jfrog-artifactory.md`.

**Implémentation :**

- [x] Vérifier et épingler une image Artifactory OSS 7.x disponible avant écriture de Compose.
- [x] Ajouter Artifactory au profil `artifacts` avec volume, healthcheck et ressources.
- [x] Créer Maven local releases/snapshots, remote Central et virtual via l'UI initiale, puis les
  vérifier de manière idempotente par l'API Storage publique.
- [x] Configurer `distributionManagement` et un `settings.xml.example` alimenté par variables.
- [x] Publier un JAR snapshot et une candidate, puis les résoudre selon la politique du virtual.
- [x] Promouvoir sans écrasement par checksum deploy, l'API de copie étant réservée à Pro.
- [x] Ajouter publication CI uniquement sur `main`/tag et seulement si les secrets existent.
- [x] Documenter GitHub vs Actions vs Artifactory vs registre Docker.
- [x] Garder npm hors périmètre : le frontend est une application, pas un package réutilisable.
- [x] Ajouter un profil JFrog Container Registry optionnel pour les images, sans prétendre que
  Docker est disponible dans Artifactory OSS.

**Commandes de validation :**

```powershell
docker compose -f docker-compose.devops.yml --profile artifacts config
make artifacts-up
make artifacts-verify
make artifacts-verify
make artifacts-publish-snapshot VERSION=0.1.20260830-SNAPSHOT
make artifacts-resolve VERSION=0.1.20260830-SNAPSHOT
make artifacts-publish-candidate VERSION=0.1.20260830
# Échec attendu : candidates est exclu du virtual avant promotion.
make artifacts-resolve VERSION=0.1.20260830
if ($LASTEXITCODE -eq 0) { throw "La candidate ne doit pas être résolue avant promotion" }
make artifacts-promote VERSION=0.1.20260830
make artifacts-resolve VERSION=0.1.20260830
# Échec attendu : une release existante n'est jamais écrasée.
make artifacts-promote VERSION=0.1.20260830
if ($LASTEXITCODE -eq 0) { throw "Une seconde promotion ne doit pas écraser la release" }
```

Utiliser une version candidate encore absente lors d'une nouvelle exécution. L'API Storage OSS
prouve uniquement la présence des cinq clés ; les publications, l'échec avant promotion et les
résolutions ci-dessus prouvent fonctionnellement leur politique Maven.

**Critères d'acceptation :**

- [x] Le JAR apparaît dans un repository Maven local et se résout via le virtual.
- [x] Les identifiants proviennent exclusivement de variables ou secrets.
- [x] Les fonctions Docker/licenciées sont clairement séparées du parcours OSS garanti.

**Dépendances :** phases 5, 6 et 8 ; 4 Go de RAM supplémentaires recommandés.

## PHASE 10 — Terraform

**Objectif :** préparer la gestion comme code des repositories JFrog avec une édition donnant
accès aux API de configuration.

**Fichiers concernés :** `infrastructure/terraform/providers.tf`, `main.tf`, `variables.tf`,
`outputs.tf`, `terraform.tfvars.example`, `.gitignore`, `docs/infrastructure/terraform.md`.

**Implémentation :**

- [ ] Installer Terraform 1.15.4 et vérifier le binaire Windows ARM64.
- [ ] Contraindre Terraform et le provider `jfrog/artifactory` 12.11.3.
- [ ] Vérifier d'abord qu'une licence Artifactory Pro ou supérieure expose les API nécessaires ;
  ne pas prétendre que le provider peut appliquer ces ressources à l'édition OSS actuelle.
- [ ] Déclarer Maven local releases/snapshots, remote Central et virtual si ce prérequis est rempli.
- [ ] Fournir URL et credentials par variables sensibles `TF_VAR_*`, jamais dans tfvars suivi.
- [ ] Produire des outputs non sensibles pour les URLs de résolution/déploiement.
- [ ] Ignorer state, plan binaire et `.terraform/`, mais versionner `.terraform.lock.hcl`.
- [ ] Importer ou recréer proprement les repositories de phase 9 afin d'éviter les doublons.
- [ ] Documenter pourquoi Compose lance Artifactory et Terraform configure son contenu.

**Commandes de validation :**

```powershell
Set-Location infrastructure/terraform
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
terraform show -no-color tfplan
```

**Critères d'acceptation :**

- [ ] Un second `terraform plan` après apply ne propose aucun changement.
- [ ] Aucun secret n'apparaît dans Git, les outputs ou les logs documentés.
- [ ] `terraform destroy` ne cible que les repositories de laboratoire déclarés.

**Dépendances :** phase 9 et Terraform installé.

## PHASE 11 — Prometheus et Grafana

**Objectif :** collecter et visualiser santé technique et métrique métier.

**Fichiers concernés :** `infrastructure/prometheus/prometheus.yml`,
`infrastructure/grafana/provisioning/**`, `infrastructure/grafana/dashboards/**`,
`docker-compose.devops.yml`, documentation observabilité.

**Implémentation :**

- [ ] Ajouter Prometheus 3.12 distroless et Grafana 13.1 au profil `observability`.
- [ ] Scraper `/actuator/prometheus` avec labels service/environnement.
- [ ] Provisionner la datasource Prometheus sans secret.
- [ ] Créer un dashboard versionné : débit, p95, erreurs, CPU, heap, threads, GC et créations.
- [ ] Utiliser des requêtes tolérant l'absence temporaire de séries.
- [ ] Ajouter volumes, healthchecks et rétention locale bornée.
- [ ] Documenter requêtes PromQL, génération de trafic et diagnostic de scrape.

**Commandes de validation :**

```powershell
docker compose -f docker-compose.devops.yml --profile observability config
docker compose -f docker-compose.devops.yml --profile observability up -d
curl.exe http://localhost:9090/-/healthy
curl.exe "http://localhost:9090/api/v1/query?query=up"
curl.exe http://localhost:3000/api/health
```

**Critères d'acceptation :**

- [ ] La target backend est UP.
- [ ] Le dashboard est provisionné automatiquement et sans clic manuel.
- [ ] `products_created_events_total` évolue après création d'un produit.

**Dépendances :** phases 1 et 4.

## PHASE 12 — Loki et Grafana Alloy

**Objectif :** centraliser les logs JSON Docker et les interroger dans Grafana.

**Fichiers concernés :** `infrastructure/loki/loki-config.yml`,
`infrastructure/alloy/config.alloy`, provisioning Grafana, Compose et documentation Loki.

**Implémentation :**

- [ ] Ajouter Loki 3.7 single-binary et Alloy 1.18 au profil `observability`.
- [ ] Monter le socket Docker en lecture seule et restreindre Alloy aux conteneurs du projet.
- [ ] Parser le format Docker puis le JSON Logstash du backend.
- [ ] Conserver service/container/level comme labels à faible cardinalité.
- [ ] Garder requestId, logger et message dans le contenu structuré, pas comme labels globaux.
- [ ] Provisionner Loki dans Grafana et ajouter un panneau de logs au dashboard.
- [ ] Documenter les requêtes LogQL pour ERROR, WARN, ProductController et ProductService.

**Commandes de validation :**

```powershell
curl.exe http://localhost:3100/ready
curl.exe http://localhost:12345/-/ready
docker compose logs backend
curl.exe -G http://localhost:3100/loki/api/v1/query_range --data-urlencode "query={service_name=\"devops-store-backend\"}"
```

**Critères d'acceptation :**

- [ ] Un log backend récent est visible dans Grafana avec timestamp, niveau et logger.
- [ ] Les quatre recherches imposées retournent des résultats quand les événements existent.
- [ ] Aucun secret, prix ou description produit n'est ajouté aux logs applicatifs.

**Dépendances :** phases 4 et 11.

## PHASE 13 — Kubernetes et Minikube

**Objectif :** déployer l'application sur un cluster Minikube persistant et observable.

**Fichiers concernés :** `infrastructure/kubernetes/namespace.yaml`, sous-dossiers frontend,
backend et postgres, `Makefile`, `docs/infrastructure/kubernetes.md`.

**Implémentation :**

- [ ] Installer Minikube 1.38.1 et utiliser Kubernetes 1.35.6 avec le kubectl 1.34 local.
- [ ] Créer namespace, ConfigMaps, exemple de Secret et procédure `kubectl create secret`.
- [ ] Déployer PostgreSQL en StatefulSet avec PVC et service ClusterIP.
- [ ] Déployer backend/frontend avec Deployments, Services et images chargées dans Minikube.
- [ ] Définir requests/limits, securityContext non-root et filesystem read-only si compatible.
- [ ] Configurer startup, readiness et liveness sur les groupes Actuator adaptés.
- [ ] Ne jamais inclure PostgreSQL dans la liveness du backend.
- [ ] Ajouter commandes Makefile start/deploy/status/delete et tests de rollout.
- [ ] Documenter accès `minikube service`, tunnel éventuel et nettoyage des PVC.

**Commandes de validation :**

```powershell
minikube start --kubernetes-version=v1.35.6
kubectl apply --dry-run=server -R -f infrastructure/kubernetes
kubectl apply -R -f infrastructure/kubernetes
kubectl get pods,svc,deployments,statefulsets,pvc -n devops-store
kubectl rollout status deployment/backend -n devops-store
kubectl rollout status deployment/frontend -n devops-store
```

**Critères d'acceptation :**

- [ ] Tous les workloads deviennent Ready et restent stables après redémarrage d'un pod.
- [ ] Le schéma PostgreSQL et les données persistent après recréation du pod.
- [ ] Une valeur secrète réelle n'existe que dans le cluster, jamais dans le dépôt.
- [ ] Les probes vérifient le bon niveau de santé sans provoquer de restart en cascade.

**Dépendances :** phases 4, 8, 11 et 12 ; Minikube/kubectl alignés.

## PHASE 14 — Documentation finale

**Objectif :** rendre le laboratoire autonome pour apprentissage, démonstration et dépannage.

**Fichiers concernés :** tous les documents annoncés dans `docs/README.md`, `README.md`,
`Makefile`, exemples de configuration et diagrammes Mermaid.

**Implémentation :**

- [ ] Créer les documents architecture, DevOps, infrastructure, observabilité et sécurité.
- [ ] Ajouter le diagramme complet de toolchain dans `docs/devops/toolchain.md`.
- [ ] Documenter chaque URL, credential initial à changer et procédure de nettoyage.
- [ ] Convertir le backlog proposé en structure importable Jira ou instructions manuelles.
- [ ] Structurer les Markdown pour copie/import dans Confluence sans appeler son API.
- [ ] Documenter les pannes réellement rencontrées et leurs preuves de résolution.
- [ ] Vérifier tous les liens, commandes, ports et versions depuis une machine propre.
- [ ] Garder le README racine sous 200 lignes et l'index docs comme navigation détaillée.
- [ ] Mettre toutes les phases terminées à `[x]` uniquement après la validation finale complète.

**Commandes de validation :**

```powershell
make help
make test
docker compose config
docker compose -f docker-compose.devops.yml config
terraform -chdir=infrastructure/terraform fmt -check -recursive
kubectl apply --dry-run=client -R -f infrastructure/kubernetes
rg -n "\[[^]]+\]\([^)]+\)" README.md docs
```

**Critères d'acceptation :**

- [ ] Un nouveau développeur peut lancer l'application en suivant uniquement le README.
- [ ] La documentation détaillée est atteignable depuis `docs/README.md`.
- [ ] Les limites locales, externes et de licence JFrog sont explicites.
- [ ] Toutes les validations applicables réussissent avec sorties consignées.

**Dépendances :** phases 1 à 13.

---

## Validation finale de bout en bout

```powershell
.\backend\mvnw.cmd clean verify
Set-Location frontend
npm ci
npm test -- --watch=false --coverage
npm run build
Set-Location ..
docker compose config
docker compose up -d
docker compose ps
curl.exe http://localhost:8080/actuator/health
terraform -chdir=infrastructure/terraform fmt -check -recursive
terraform -chdir=infrastructure/terraform validate
kubectl get pods,svc,deployments -n devops-store
```

La réussite d'un sous-ensemble ne permet pas de déclarer le laboratoire terminé. Les commandes
nécessitant GitHub, Jira, Confluence ou JFrog distant restent conditionnées aux comptes et
secrets externes explicitement fournis.

## Références de compatibilité

- [Angular — compatibilité des versions](https://angular.dev/reference/versions)
- [Angular — tests Vitest](https://angular.dev/guide/testing)
- [Spring Boot 4.1 — prérequis système](https://docs.spring.io/spring-boot/system-requirements.html)
- [Springdoc — matrice Spring Boot 4](https://springdoc.org/v4/index.html)
- [PostgreSQL — politique de versions](https://www.postgresql.org/support/versioning/)
- [Flyway — PostgreSQL](https://documentation.red-gate.com/fd/postgresql-database-277579325.html)
- [Testcontainers — module PostgreSQL](https://java.testcontainers.org/modules/databases/postgres/)
- [SonarQube — image officielle](https://hub.docker.com/_/sonarqube)
- [Trivy — releases](https://github.com/aquasecurity/trivy/releases)
- [Terraform — releases](https://github.com/hashicorp/terraform/releases)
- [Kubernetes — releases](https://kubernetes.io/releases/)
- [Grafana Alloy — releases](https://github.com/grafana/alloy/releases)
- [JFrog Container Registry — périmètre](https://docs.jfrog.com/artifactory/docs/jfrog-container-registry)
