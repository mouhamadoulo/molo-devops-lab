# AGENTS.md

## Portée

Ces instructions s'appliquent à tout le dépôt. Si un sous-dossier reçoit plus tard son propre
`AGENTS.md`, le fichier le plus proche du code modifié prévaut pour ce sous-dossier.

## État du projet

DevOps Store est un laboratoire DevSecOps autour d'un catalogue de produits. Le périmètre métier
reste volontairement simple afin de concentrer le travail sur la qualité, la sécurité, la livraison
et l'observabilité.

À ce stade, l'application et sa stack Docker Compose locale sont implémentées :

- le backend Spring Boot, l'identité, le RBAC, la galerie privée d'images produits et leurs tests
  sont opérationnels dans `backend/` ;
- `frontend/` contient Angular 22, la session en mémoire, les guards, le login, le shell responsive,
  le CRUD produits et l'administration des utilisateurs ;
- les images multi-stage backend/frontend et `docker-compose.yml` démarrent Nginx, Spring Boot,
  PostgreSQL et AIStor Free avec healthchecks ; GitHub Actions et le profil qualité SonarQube sont
  opérationnels ; Trivy contrôle le dépôt, les dépendances, les configurations et les images avec
  des rapports CI, tandis que JFrog, l'infrastructure et l'observabilité restent planifiés ;
- ne pas annoncer ni utiliser une commande planifiée tant que les fichiers correspondants
  (`frontend/package.json`, `Makefile`, fichiers Compose, etc.) n'existent pas.

Avant une modification importante, consulter :

- `README.md` pour la vue d'ensemble ;
- `docs/IMPLEMENTATION_PLAN.md` pour les décisions, phases et critères d'acceptation ;
- `Prompt-DevSecOps-Lab.md` pour le cahier des charges complet.

## Stack

### Implémentée

- Java 25 ;
- Spring Boot 4.1.0 et Maven Wrapper 3.9.13 ;
- Spring MVC, Jakarta Validation, Spring Data JPA et Actuator ;
- PostgreSQL 18, Flyway et le pilote PostgreSQL ;
- Micrometer avec registre Prometheus et logs structurés Logstash ;
- springdoc OpenAPI 3.0.3 ;
- JUnit Jupiter, AssertJ, Mockito et Testcontainers PostgreSQL 2.0.5.
- Angular 22, TypeScript 6, Node.js 24, npm 11, Vitest, ESLint et Playwright ;
- session Angular par Signals, JWT en mémoire, refresh rotatif et navigation par rôle.
- Docker Compose 5.1 avec PostgreSQL 18.4 et AIStor Free single-node épinglé.
- MinIO Java 9, validation JPEG/PNG/WebP et stockage privé par URL présignée.
- images Maven/JDK vers JRE 25 et Node 24 vers Nginx 1.31.3, avec runtimes non-root.
- GitHub Actions et Dependabot avec actions épinglées par SHA.
- SonarQube Community Build 26.7, Scanner Maven 5.5.0.6356, Scanner NPM 5.0.0 et import des
  rapports JaCoCo, LCOV, Surefire et Vitest.
- Trivy 0.73.0 conteneurisé et vérifié par Cosign, avec scans filesystem, configuration et images,
  rapports texte/SARIF et gate sur les vulnérabilités HIGH/CRITICAL corrigibles.

### Cible planifiée

- JFrog Artifactory ;
- Terraform, Kubernetes/Minikube, Prometheus, Grafana, Loki et Grafana Alloy.

Toujours distinguer cette cible de ce qui est réellement disponible dans le dépôt.

## Architecture actuelle

Le backend est organisé par fonctionnalité, puis par couche, sous le package
`com.molo.devopsstore` :

- `product/api` : contrôleurs REST et gestion globale des erreurs ;
- `product/api/dto` : contrats d'entrée et de sortie sous forme de `record` ;
- `product/application` : services, transactions, mapping et exceptions applicatives ;
- `product/domain` : entités et types métier ;
- `product/infrastructure` : repositories Spring Data et spécifications JPA ;
- `common/web` : préoccupations HTTP transversales, notamment CORS et `X-Request-ID`.

Flux principal : contrôleur REST -> service applicatif -> repository JPA -> PostgreSQL. Les
migrations Flyway dans `backend/src/main/resources/db/migration/` définissent le schéma et les
données de démonstration. Hibernate utilise `ddl-auto=validate` et ne doit pas remplacer les
migrations.

L'API Products est versionnée sous `/api/v1/products`. Les erreurs HTTP utilisent `ProblemDetail`
avec le type `application/problem+json`. Les endpoints Actuator exposés sont limités à `health`,
`info` et `prometheus`.

Les métadonnées de galerie restent dans PostgreSQL et les objets dans AIStor. Une suppression
publie un événement traité uniquement après commit, avec trois tentatives bornées. Un reconciler
planifié compare le préfixe `products/` aux clés référencées et ne supprime que les orphelins plus
anciens que la fenêtre de sécurité configurée.

Au démarrage normal, `ObjectStorageInitializer` crée le bucket de manière idempotente. Les tests
Spring génériques désactivent ce démarrage externe avec `app.storage.initialize-bucket=false` ; le
test AIStor dédié vérifie l'initialisation réelle.

## Configuration locale

Le backend lit les variables suivantes, avec des valeurs locales par défaut :

- `DB_URL` ;
- `DB_USERNAME` ;
- `DB_PASSWORD` ;
- `CORS_ALLOWED_ORIGIN`.
- `JWT_SECRET` et `JWT_ISSUER` ;
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` et `BOOTSTRAP_ADMIN_NAME` ;
- `AUTH_COOKIE_SECURE`.
- `MINIO_LICENSE_FILE`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_ACCESS_KEY`,
  `MINIO_SECRET_KEY`, `MINIO_BUCKET` et `MINIO_REGION`.
- `MINIO_INITIALIZE_BUCKET`, `MINIO_ORPHAN_MIN_AGE` et
  `MINIO_ORPHAN_RECONCILIATION_INTERVAL`.
- Le profil qualité local utilise `SONAR_PORT`, `SONAR_DB_NAME`, `SONAR_DB_USERNAME` et
  `SONAR_DB_PASSWORD`. Les scans utilisent `SONAR_HOST_URL` et `SONAR_TOKEN` fournis hors Git.
  Sur Windows ARM64, définir aussi `SONAR_SCANNER_JAVA_EXE_PATH` vers le binaire Java 25 x64.

Ne jamais versionner de secret réel. Ajouter les exemples sans secret dans un fichier
`.env.example` si nécessaire et conserver les valeurs sensibles hors de Git.

## Commandes de build et d'exécution

### Frontend Angular

Exécuter les commandes npm depuis `frontend/` :

```bash
npm start
npm run lint
npm run test:ci
npm run build
npm run e2e
```

`npm run e2e` démarre le serveur Angular défini dans `playwright.config.ts` lorsque nécessaire.

Exécuter les commandes Maven depuis `backend/`.

### Linux et macOS

```bash
cd backend
./mvnw clean verify
./mvnw spring-boot:run
```

### Windows PowerShell

```powershell
Set-Location backend
.\mvnw.cmd clean verify
.\mvnw.cmd spring-boot:run
```

`spring-boot:run` nécessite un PostgreSQL accessible. Utiliser les variables de configuration
ci-dessus si la base ne correspond pas aux valeurs locales par défaut.

La stack complète se lance depuis la racine après copie de `.env.example` vers `.env`, remplissage
des secrets obligatoires et téléchargement de la licence AIStor Free :

```powershell
docker compose config
docker compose build --pull
docker compose up -d --wait
docker compose ps
docker compose down
```

Avec GNU Make, les cibles disponibles sont `help`, `application`, `build`, `test`, `backend-test`,
`frontend-test`, `up`, `down`, `status`, `logs`, `quality-config`, `quality-up`, `quality-down`,
`quality-status`, `quality-logs`, `quality-reset`, `sonar`, `sonar-backend`, `sonar-frontend`,
`ci-lint`, `trivy-verify`, `trivy-fs`, `trivy-config`, `trivy-images` et `security`.
`down` et `quality-down` préservent les volumes nommés ; `quality-reset` les supprime. Le fichier
de licence reste hors Git. AIStor Free est limité au single-node sans SLA/SLO.

Le profil SonarQube est documenté dans `docs/devops/sonarqube.md`. Son port 9000 par défaut entre
en conflit avec AIStor lorsque les deux stacks sont lancées simultanément ; utiliser `SONAR_PORT`
pour déplacer SonarQube.

La politique Trivy et ses commandes sont documentées dans `docs/devops/trivy.md`. `make security`
vérifie la provenance de l'image Trivy, prépare le cache Maven, scanne le dépôt et les
configurations, construit les images applicatives puis les scanne.

## Tests

La validation complète est :

```bash
cd backend
./mvnw clean verify
```

Sous Windows :

```powershell
Set-Location backend
.\mvnw.cmd clean verify
```

Pour les seuls tests ou une classe ciblée :

```bash
./mvnw test
./mvnw -Dtest=ProductServiceTest test
```

La suite complète inclut `MinioObjectStorageIntegrationTest`. `MINIO_LICENSE_FILE` doit pointer
vers une licence AIStor locale lisible ; le test l'installe en lecture seule dans un conteneur
éphémère et n'en journalise jamais le contenu.

Les tests de repository et d'intégration HTTP démarrent PostgreSQL avec Testcontainers ; Docker
doit donc être disponible. Ne pas remplacer PostgreSQL par H2 et ne pas mocker la base lorsqu'un
test vérifie réellement l'intégration PostgreSQL.

Conventions de test détectées :

- classes nommées `*Test` et méthodes de test comportementales en lowerCamelCase ;
- AssertJ pour les assertions ;
- Mockito pour les services et contrôleurs isolés ;
- Testcontainers pour la persistance et les parcours HTTP complets ;
- tests ciblés sur le comportement utile, sans cas artificiels ajoutés uniquement pour gonfler la
  couverture.

## Lint et formatage

Aucun linter ou formatter Java n'est actuellement configuré : pas de Checkstyle, Spotless, PMD ni
`.editorconfig`. Ne pas inventer de commande `lint` et ne pas déclarer qu'un lint a réussi.

Les contrôles disponibles sont :

```bash
git diff --check
cd backend && ./mvnw clean verify
```

Si un outil de formatage ou de lint est ajouté, le configurer dans le dépôt, documenter sa commande
ici et l'intégrer au build ou à la CI.

## Conventions de code

### Java et Spring

- utiliser 4 espaces, les accolades sur la même ligne et des imports explicites ;
- conserver les noms de packages, classes, méthodes et tests en anglais ;
- utiliser l'injection par constructeur, sans injection de champs ;
- employer `var` uniquement lorsque le type local reste évident ;
- déclarer les constantes en `private static final` ou avec la visibilité minimale nécessaire ;
- garder les contrôleurs minces : validation et adaptation HTTP dans `api`, logique métier dans
  `application` ;
- délimiter les transactions dans les services et utiliser `@Transactional(readOnly = true)` pour
  les lectures ;
- conserver les DTOs séparés des entités et privilégier les `record` pour les contrats immuables ;
- préserver l'encapsulation des entités : constructeur JPA protégé, fabrique ou méthodes métier,
  pas de setters publics génériques ;
- centraliser les erreurs REST dans `ApiExceptionHandler` et maintenir un contrat
  `ProblemDetail` cohérent ;
- valider explicitement les propriétés de tri avant de les transmettre à JPA.

### Base de données

- nommer les migrations `V<n>__description.sql` ;
- ne pas modifier une migration déjà appliquée : ajouter une nouvelle version ;
- garder les contraintes métier importantes dans PostgreSQL en plus de la validation applicative ;
- utiliser `TIMESTAMPTZ`/`Instant` et conserver la configuration UTC ;
- ajouter des index seulement pour des accès justifiés par les requêtes réelles.

### Observabilité et HTTP

- propager ou générer `X-Request-ID`, l'ajouter au MDC et toujours nettoyer le MDC ;
- ne pas exposer de nouvel endpoint Actuator sans justification ;
- préserver les noms de métriques déjà publiés ou documenter explicitement toute rupture ;
- limiter CORS aux origines, méthodes et en-têtes nécessaires.

### Documentation

- garder le `README.md` racine court et orienté démarrage ;
- placer les explications détaillées dans `docs/` et maintenir `docs/README.md` comme index ;
- fournir des commandes copiables et leurs prérequis ;
- distinguer clairement les fonctionnalités disponibles de celles qui sont planifiées ;
- mettre à jour `docs/IMPLEMENTATION_PLAN.md` lorsqu'une phase ou un critère d'acceptation change.

## Discipline de modification

- vérifier `git status` et le diff avant toute modification ;
- préserver les changements utilisateur sans rapport avec la tâche ;
- ne pas versionner `backend/target/`, secrets, caches, états Terraform ni dépendances générées ;
- préférer une modification minimale alignée sur les patterns existants ;
- exécuter les validations proportionnées au code touché avant d'annoncer la fin du travail.

## Git commits

Respecter strictement les règles suivantes :

- Never add `Co-Authored-By` trailers to commit messages.
- Never mention Codex, OpenAI, ChatGPT, or AI assistance in commit messages.
- Commit using only the configured Git user as the author.

Ne pas modifier l'identité Git configurée et ne pas utiliser `--author`. Garder les messages de
commit courts et centrés sur le changement. Ne committer ou pousser que si la demande utilisateur
l'autorise explicitement, et n'indexer que les fichiers appartenant au périmètre confirmé.
