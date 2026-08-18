Tu es un **Senior Fullstack Engineer / Software Architect / DevSecOps Engineer** expert en :

- Angular 22
- TypeScript moderne
- Java 25
- Spring Boot 4
- PostgreSQL
- Docker / Docker Compose
- Kubernetes / Minikube
- Git / GitHub
- GitHub Actions
- SonarQube
- Trivy
- JFrog Artifactory
- Terraform
- Prometheus
- Grafana
- Loki / Grafana Alloy
- Jira
- Confluence

Je veux que tu conçoives puis développes un **mini-projet Fullstack moderne servant de laboratoire DevSecOps complet**, avec une application suffisamment réaliste pour illustrer une chaîne DevOps de bout en bout, mais volontairement limitée fonctionnellement.

L’objectif principal est de maîtriser cette chaîne :

**Planification → Développement → Versioning → CI → Tests → Qualité → Sécurité → Build → Artifact Repository → IaC → Conteneurisation → Déploiement → Monitoring → Logs**

---

# 1. Cas d’usage

Créer une application appelée :

**DevOps Store**

Il s’agit d’une mini-application de gestion d’un catalogue de produits électroniques.

L’application doit permettre de :

- afficher la liste des produits ;
- consulter le détail d’un produit ;
- ajouter un produit ;
- modifier un produit ;
- supprimer un produit ;
- filtrer les produits ;
- rechercher un produit par nom ;
- filtrer par catégorie ;
- afficher uniquement les produits disponibles.

Un produit possède au minimum :

```text
id
name
description
category
price
stockQuantity
available
createdAt
updatedAt
```

Exemples de catégories :

```text
SMARTPHONE
LAPTOP
TABLET
ACCESSORY
AUDIO
OTHER
```

Le domaine métier doit rester volontairement simple.

Ne pas transformer ce projet en plateforme e-commerce complète.

Pas de paiement, panier, commande, utilisateur, authentification ou microservices dans le MVP.

Le but principal reste l’apprentissage DevOps.

---

# 2. Stack obligatoire

## Frontend

Utiliser impérativement :

```text
Angular 22
TypeScript
```

Respecter les **best practices Angular 22 actuelles**.

Privilégier notamment :

- standalone components ;
- standalone APIs ;
- Signals ;
- computed signals lorsque pertinent ;
- effect uniquement lorsque réellement nécessaire ;
- Reactive Forms ;
- typed forms ;
- HttpClient ;
- functional interceptors ;
- functional guards si nécessaire ;
- lazy loading des features ;
- nouvelle syntaxe de contrôle Angular :

```text
@if
@for
@switch
```

- ChangeDetectionStrategy.OnPush lorsque pertinent ;
- inject() lorsque cela simplifie le code ;
- séparation présentation / logique métier ;
- composants petits et réutilisables ;
- services spécialisés ;
- modèles et interfaces fortement typés ;
- gestion explicite des états loading / error / success ;
- RxJS uniquement lorsque les streams sont pertinents ;
- conversion RxJS ↔ Signals lorsque pertinente ;
- pas de subscriptions manuelles inutiles ;
- pas de NgModules sauf nécessité technique clairement justifiée.

Organiser Angular par **features**, et non uniquement par type technique.

Architecture recommandée :

```text
frontend/src/app/
├── core/
│   ├── config/
│   ├── interceptors/
│   └── services/
│
├── shared/
│   ├── components/
│   ├── models/
│   └── utils/
│
├── features/
│   └── products/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── models/
│       └── products.routes.ts
│
├── app.config.ts
├── app.routes.ts
└── app.ts
```

Ne pas utiliser une architecture artificiellement complexe.

---

# 3. Backend

Utiliser impérativement :

```text
Java 25
Spring Boot 4
Maven
```

Respecter les **best practices Java 25 et Spring Boot 4**.

Utiliser notamment :

- records pour les DTO lorsque pertinent ;
- enums ;
- Optional uniquement lorsque pertinent ;
- immutabilité autant que possible ;
- constructor injection ;
- Bean Validation ;
- gestion centralisée des exceptions ;
- Problem Details RFC 9457 lorsque pertinent ;
- pagination Spring Data ;
- Spring Data JPA ;
- Spring Boot Actuator ;
- configuration externalisée ;
- profils Spring ;
- logs structurés ;
- tests unitaires ;
- tests d’intégration.

Éviter :

- field injection ;
- classes God Object ;
- DTO retournant directement les entités JPA ;
- logique métier dans les controllers ;
- try/catch inutiles ;
- Optional comme attribut d’entité ;
- dépendances inutiles ;
- abstraction prématurée.

Architecture backend recommandée :

```text
backend/src/main/java/.../
├── product/
│   ├── api/
│   │   ├── ProductController.java
│   │   └── dto/
│   │
│   ├── application/
│   │   └── ProductService.java
│   │
│   ├── domain/
│   │   ├── Product.java
│   │   └── ProductCategory.java
│   │
│   └── infrastructure/
│       └── ProductRepository.java
│
├── common/
│   ├── exception/
│   └── config/
│
└── Application.java
```

Tu peux adapter légèrement cette structure si une architecture plus simple est préférable.

Favoriser la lisibilité à la surarchitecture.

---

# 4. Base de données

Utiliser :

```text
PostgreSQL
Flyway
```

Créer les migrations SQL dans :

```text
backend/src/main/resources/db/migration/
```

Par exemple :

```text
V1__create_product_table.sql
V2__insert_sample_products.sql
```

Utiliser PostgreSQL localement avec Docker Compose.

Ne pas laisser Hibernate gérer automatiquement le schéma en environnement normal.

Privilégier :

```text
ddl-auto=validate
```

avec Flyway responsable des migrations.

---

# 5. API REST

Créer au minimum :

```text
GET    /api/v1/products
GET    /api/v1/products/{id}
POST   /api/v1/products
PUT    /api/v1/products/{id}
DELETE /api/v1/products/{id}
```

Permettre sur la liste :

```text
pagination
tri
recherche
filtre par catégorie
filtre disponible / indisponible
```

Exemple :

```text
GET /api/v1/products?page=0&size=20&sort=name,asc&category=LAPTOP&available=true&search=mac
```

Ajouter OpenAPI / Swagger si compatible avec Spring Boot 4.

---

# 6. Tests

## Backend

Utiliser :

```text
JUnit 5
Mockito
Spring Boot Test
Testcontainers
```

Utiliser **Testcontainers PostgreSQL** pour les tests d’intégration lorsque pertinent.

Tester au minimum :

```text
ProductService
ProductController
ProductRepository
```

Ne pas mocker PostgreSQL lorsque l’objectif du test est l’intégration avec PostgreSQL.

---

## Frontend

Créer des tests Angular pertinents.

Tester au minimum :

- composants importants ;
- services HTTP ;
- logique de formulaire ;
- affichage loading/error ;
- fonctionnalités principales du catalogue.

Ne pas créer des dizaines de tests artificiels uniquement pour augmenter la couverture.

---

# 7. Repository

Utiliser un monorepo :

```text
devops-product-catalog/
│
├── frontend/
│
├── backend/
│
├── infrastructure/
│   ├── terraform/
│   ├── kubernetes/
│   ├── prometheus/
│   ├── grafana/
│   ├── loki/
│   └── alloy/
│
├── docs/
│   ├── architecture/
│   ├── devops/
│   ├── infrastructure/
│   ├── observability/
│   ├── security/
│   └── troubleshooting/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── docker-compose.devops.yml
├── .env.example
├── Makefile
├── README.md
└── .gitignore
```

Le dossier `docs/` doit contenir l’essentiel de la documentation.

Le README doit rester court.

---

# 8. Philosophie de documentation

Je ne veux PAS d’un README énorme.

Le fichier :

```text
README.md
```

doit uniquement servir de point d’entrée.

Il doit contenir environ :

```text
Présentation
Architecture globale
Stack
Prérequis
Quick Start
Commandes principales
Liens vers la documentation
```

Éviter de dépasser environ 150 à 200 lignes.

Toute la documentation détaillée doit être placée dans :

```text
docs/
```

---

# 9. Organisation de docs/

Créer une structure claire.

Exemple :

```text
docs/
│
├── README.md
│
├── architecture/
│   ├── overview.md
│   ├── frontend.md
│   ├── backend.md
│   └── data-flow.md
│
├── devops/
│   ├── toolchain.md
│   ├── git-workflow.md
│   ├── github-actions.md
│   ├── sonarqube.md
│   ├── trivy.md
│   └── jfrog-artifactory.md
│
├── infrastructure/
│   ├── docker.md
│   ├── terraform.md
│   └── kubernetes.md
│
├── observability/
│   ├── prometheus.md
│   ├── grafana.md
│   └── loki.md
│
├── security/
│   └── security-guidelines.md
│
└── troubleshooting/
    └── common-issues.md
```

Créer :

```text
docs/README.md
```

comme index de la documentation.

---

# 10. Planification

Utiliser :

```text
Jira
Confluence
```

Jira servira à :

```text
Epics
Stories
Tasks
Bugs
Sprint
Backlog
```

Proposer des Epics comme :

```text
EPIC-1 Application Fullstack
EPIC-2 Containerisation
EPIC-3 CI/CD
EPIC-4 Quality & Security
EPIC-5 Artifact Management
EPIC-6 Infrastructure
EPIC-7 Kubernetes
EPIC-8 Observability
```

Proposer des User Stories et Tasks associées.

Exemples :

```text
DEVOPS-1 Initialiser Spring Boot
DEVOPS-2 Implémenter API Products
DEVOPS-3 Initialiser Angular 22
DEVOPS-4 Créer UI catalogue
DEVOPS-5 Dockeriser backend
DEVOPS-6 Dockeriser frontend
DEVOPS-7 Configurer GitHub Actions
DEVOPS-8 Intégrer SonarQube
DEVOPS-9 Intégrer Trivy
DEVOPS-10 Configurer JFrog Artifactory
```

La documentation créée dans `docs/` doit pouvoir servir de base à Confluence.

---

# 11. Git / GitHub

Utiliser :

```text
Git
GitHub
```

Workflow :

```text
main
develop
feature/*
fix/*
```

Utiliser Conventional Commits :

```text
feat:
fix:
docs:
test:
ci:
build:
refactor:
perf:
chore:
```

Créer :

```text
.github/pull_request_template.md
```

Expliquer simplement :

- branch ;
- commit ;
- push ;
- Pull Request ;
- review ;
- merge ;
- tag ;
- release.

---

# 12. CI

Utiliser :

```text
GitHub Actions
```

Créer des workflows séparés lorsque pertinent.

Par exemple :

```text
.github/workflows/backend-ci.yml
.github/workflows/frontend-ci.yml
.github/workflows/security.yml
.github/workflows/docker.yml
```

Backend :

```bash
./mvnw clean verify
```

Frontend :

```bash
npm ci
npm test
npm run build
```

Déclenchement :

```text
pull_request
push vers develop
push vers main
```

Exploiter correctement :

- cache Maven ;
- cache npm ;
- artifacts ;
- matrices uniquement si elles apportent une vraie valeur ;
- permissions GitHub minimales ;
- secrets GitHub.

---

# 13. SonarQube

Utiliser :

```text
SonarQube
```

SonarQube doit pouvoir tourner localement avec Docker Compose.

Analyser :

```text
backend
frontend
tests
coverage
bugs
code smells
duplications
vulnerabilities
```

Documenter dans :

```text
docs/devops/sonarqube.md
```

Ajouter l’analyse dans GitHub Actions lorsque cela est possible.

---

# 14. Trivy

Utiliser :

```text
Trivy
```

Scanner :

```text
filesystem
dependencies
Docker images
IaC
```

Exemples :

```bash
trivy fs .
trivy image devops-product-backend
trivy image devops-product-frontend
trivy config infrastructure/
```

Ajouter Trivy au pipeline GitHub Actions.

Documenter dans :

```text
docs/devops/trivy.md
```

---

# 15. JFrog Artifactory

Utiliser impérativement :

```text
JFrog Artifactory
```

et non Nexus.

Je veux comprendre concrètement le rôle d'un Artifact Repository.

Utiliser JFrog pour illustrer :

- stockage d’artefacts Maven ;
- repositories Maven local / remote / virtual ;
- packages npm si pertinent ;
- Docker Registry ;
- publication des builds ;
- récupération des artefacts ;
- promotion d’artefacts lorsque cela reste raisonnablement simple.

Créer une configuration locale de JFrog Artifactory lorsque la version utilisée permet de le faire de manière réaliste.

Ne pas inventer une configuration locale si certaines fonctionnalités nécessitent une licence.

Documenter clairement les différences entre :

```text
GitHub
GitHub Actions
JFrog Artifactory
Docker Registry
```

Créer :

```text
docs/devops/jfrog-artifactory.md
```

Configurer Maven pour pouvoir publier le `.jar` backend dans Artifactory.

Configurer également le pipeline pour pouvoir publier les images Docker dans un repository Docker Artifactory si la configuration choisie le permet.

Les identifiants JFrog ne doivent jamais être stockés dans Git.

Utiliser :

```text
.env
GitHub Secrets
Maven settings.xml
variables d'environnement
```

selon le contexte.

---

# 16. Docker

Créer :

```text
frontend/Dockerfile
backend/Dockerfile
```

Utiliser des multi-stage builds.

Backend :

```text
Maven / Java 25 build
        ↓
Runtime Java 25
```

Frontend :

```text
Node compatible Angular 22
        ↓
Angular production build
        ↓
Nginx
```

Respecter les bonnes pratiques :

- petites images ;
- multi-stage ;
- utilisateur non-root lorsque pertinent ;
- `.dockerignore` ;
- healthcheck ;
- cache des dépendances ;
- aucun secret dans les images.

---

# 17. Docker Compose applicatif

Créer :

```text
docker-compose.yml
```

permettant de lancer :

```text
frontend
backend
postgres
```

Une commande :

```bash
docker compose up -d
```

doit suffire pour démarrer l’application complète.

Ajouter :

- healthchecks ;
- volumes ;
- réseau ;
- variables d’environnement ;
- depends_on avec conditions de santé lorsque pertinent.

---

# 18. Docker Compose DevOps

Créer :

```text
docker-compose.devops.yml
```

pour exécuter autant que possible localement :

```text
SonarQube
JFrog Artifactory
Prometheus
Grafana
Loki
Grafana Alloy
```

PostgreSQL peut être partagé ou séparé selon le besoin.

Éviter les conflits de ports.

Documenter les URLs locales.

---

# 19. Terraform

Utiliser :

```text
Terraform
```

Créer :

```text
infrastructure/terraform/
├── providers.tf
├── main.tf
├── variables.tf
├── outputs.tf
└── terraform.tfvars.example
```

Le but est d'apprendre :

```bash
terraform init
terraform fmt
terraform validate
terraform plan
terraform apply
terraform destroy
```

Utiliser Terraform uniquement pour des ressources où son usage est cohérent.

Ne pas remplacer arbitrairement Docker Compose par Terraform uniquement pour dire que Terraform est utilisé.

Documenter cette distinction.

---

# 20. Kubernetes

Utiliser :

```text
Minikube
kubectl
```

Créer :

```text
infrastructure/kubernetes/
```

Organisation :

```text
namespace.yaml

frontend/
  deployment.yaml
  service.yaml

backend/
  deployment.yaml
  service.yaml
  configmap.yaml
  secret.example.yaml

postgres/
  statefulset.yaml
  service.yaml
  pvc.yaml
```

Utiliser :

```text
ConfigMap
Secret
Deployment
StatefulSet
Service
PVC
```

Ajouter :

```text
resources.requests
resources.limits
livenessProbe
readinessProbe
startupProbe lorsque pertinent
```

Ne jamais committer un vrai secret Kubernetes.

Créer uniquement :

```text
secret.example.yaml
```

ou utiliser une génération documentée.

---

# 21. Spring Boot Actuator

Configurer :

```text
Spring Boot Actuator
Micrometer
```

Exposer uniquement les endpoints nécessaires :

```text
/actuator/health
/actuator/info
/actuator/prometheus
```

Configurer correctement les probes Kubernetes.

---

# 22. Prometheus

Utiliser :

```text
Prometheus
```

Prometheus doit scraper le backend via :

```text
/actuator/prometheus
```

Monitorer notamment :

```text
HTTP requests
HTTP latency
HTTP errors
JVM memory
CPU
threads
GC
```

Créer aussi une métrique métier comme :

```text
products_created_total
```

---

# 23. Grafana

Utiliser :

```text
Grafana
```

Créer un dashboard contenant au minimum :

```text
requêtes HTTP
latence
erreurs
CPU
mémoire JVM
GC
nombre de produits créés
```

Versionner si possible :

```text
datasources
dashboards
dashboard provisioning
```

dans :

```text
infrastructure/grafana/
```

---

# 24. Logs

Utiliser :

```text
Grafana Loki
Grafana Alloy
```

Préférer **Grafana Alloy** à Promtail si c'est le choix moderne recommandé pour les versions utilisées.

Configurer Spring Boot avec des logs adaptés à l’observabilité.

Privilégier des logs structurés JSON lorsque cela reste simple.

Pouvoir rechercher dans Grafana :

```text
ERROR
WARN
ProductController
ProductService
```

Ajouter si pertinent :

```text
traceId
requestId
logger
level
timestamp
```

---

# 25. Architecture DevOps finale

La chaîne cible doit être :

```text
Jira / Confluence
       ↓
Git
       ↓
GitHub
       ↓
GitHub Actions
       ↓
┌─────────────┬─────────────┐
│ Tests       │ SonarQube   │
│             │ Trivy       │
└──────┬──────┴──────┬──────┘
       ↓             ↓
      Build        Security
       ↓
     Docker
       ↓
JFrog Artifactory
       ↓
Terraform / Kubernetes
       ↓
    Minikube
       ↓
┌─────────────┬─────────────┐
│ Prometheus  │ Loki        │
└──────┬──────┴──────┬──────┘
       └───────┬─────┘
               ↓
            Grafana
```

Créer un diagramme Mermaid propre dans :

```text
docs/devops/toolchain.md
```

---

# 26. Makefile

Créer un Makefile simple.

Exemples :

```bash
make help

make backend-test
make frontend-test
make test

make build

make docker-build
make docker-up
make docker-down

make sonar
make trivy

make devops-up
make devops-down

make terraform-init
make terraform-plan
make terraform-apply
make terraform-destroy

make minikube-start
make k8s-deploy
make k8s-status
make k8s-delete
```

Ne pas créer 50 commandes inutiles.

`make help` doit documenter les principales.

---

# 27. README

Le README doit rester court.

Structure attendue :

```text
# DevOps Product Catalog

Courte présentation

## Architecture

Diagramme très simple

## Stack

Tableau synthétique

## Quick Start

docker compose up -d

## URLs

Frontend
Backend
Swagger
Grafana
SonarQube
JFrog

## Commands

quelques commandes essentielles

## Documentation

liens vers docs/README.md
```

L’essentiel des explications doit être dans `docs/`.

---

# 28. Qualité du code

Tous les fichiers produits doivent respecter les bonnes pratiques actuelles de :

```text
Angular 22
TypeScript
Java 25
Spring Boot 4
PostgreSQL
Docker
GitHub Actions
Terraform
Kubernetes
```

Avant d'utiliser une API récente ou un comportement dépendant d'une version, vérifier sa compatibilité avec les versions réellement utilisées.

Ne pas recopier des pratiques obsolètes provenant d'Angular 15/16 ou Spring Boot 2/3 si une meilleure approche existe avec Angular 22 / Spring Boot 4.

---

# 29. Sécurité

Respecter au minimum :

- aucun secret Git ;
- `.env.example` ;
- `.gitignore` correct ;
- GitHub Secrets ;
- images Docker scannées ;
- dépendances scannées ;
- utilisateurs non-root ;
- validation des inputs ;
- gestion propre des erreurs ;
- headers HTTP pertinents ;
- configuration CORS restrictive ;
- logs sans données sensibles.

Ne pas ajouter Vault au MVP.

---

# 30. Validation obligatoire

Après chaque phase, exécuter les validations pertinentes.

Backend :

```bash
./mvnw clean verify
```

Frontend :

```bash
npm ci
npm test
npm run build
```

Docker :

```bash
docker compose config
docker compose up -d
docker compose ps
```

Backend :

```bash
curl http://localhost:8080/actuator/health
```

Terraform :

```bash
terraform fmt -check
terraform validate
```

Kubernetes :

```bash
kubectl get pods
kubectl get svc
kubectl get deployments
```

En cas d’erreur :

1. analyser la cause ;
2. corriger ;
3. relancer ;
4. ne pas marquer la phase terminée tant que les validations associées échouent.

---

# 31. Plan d’implémentation

IMPORTANT :

Ne commence PAS à créer tout le projet immédiatement.

Commence par créer :

```text
docs/IMPLEMENTATION_PLAN.md
```

Découper le travail approximativement comme ceci :

```text
PHASE 0  Architecture et choix techniques
PHASE 1  Backend Spring Boot 4 / Java 25 / PostgreSQL
PHASE 2  Frontend Angular 22
PHASE 3  Tests
PHASE 4  Docker
PHASE 5  Git / GitHub
PHASE 6  GitHub Actions
PHASE 7  SonarQube
PHASE 8  Trivy
PHASE 9  JFrog Artifactory
PHASE 10 Terraform
PHASE 11 Prometheus / Grafana
PHASE 12 Loki / Alloy
PHASE 13 Kubernetes / Minikube
PHASE 14 Documentation finale
```

Pour chaque phase indiquer :

```text
Objectif
Fichiers concernés
Implémentation
Commandes de validation
Critères d'acceptation
Dépendances
```

Utiliser des checkboxes Markdown :

```text
- [ ] À faire
- [x] Terminé
```

Mettre ce fichier à jour au fur et à mesure.

---

# 32. Façon de travailler

Travaille comme un ingénieur expérimenté.

Avant toute modification importante :

1. inspecte le projet existant ;
2. comprends ce qui est déjà présent ;
3. évite d'écraser du code fonctionnel ;
4. propose l'approche la plus simple ;
5. implémente ;
6. teste ;
7. corrige si nécessaire ;
8. documente.

Ne crée pas un fichier uniquement parce qu'il est souvent présent dans un projet.

Chaque fichier doit avoir une utilité claire.

---

# 33. Priorités

Respecter cet ordre de priorité :

```text
1. Fonctionnement réel
2. Simplicité
3. Best practices
4. Maintenabilité
5. Sécurité
6. Documentation
7. Démonstration DevOps
```

Éviter :

```text
surarchitecture
abstractions prématurées
code mort
configuration inutilisée
pseudo-code
TODO laissés sans justification
duplication inutile
```

---

# 34. Résultat final

À la fin, le repository doit constituer un véritable **DevSecOps Lab Fullstack** permettant de démontrer :

```text
Angular 22
Java 25
Spring Boot 4
PostgreSQL
Flyway
Testcontainers
Git
GitHub
GitHub Actions
SonarQube
Trivy
Docker
JFrog Artifactory
Terraform
Minikube
Kubernetes
Spring Boot Actuator
Micrometer
Prometheus
Grafana
Loki
Grafana Alloy
Jira
Confluence
```

Je dois pouvoir utiliser ce projet comme :

- laboratoire DevOps local ;
- support d’apprentissage ;
- démonstration technique ;
- portfolio GitHub ;
- support pour entretien Fullstack / DevOps / DevSecOps.

---

# 35. Première action à effectuer

Commence UNIQUEMENT par :

1. analyser les choix techniques ;
2. vérifier la compatibilité des versions Angular 22 / Java 25 / Spring Boot 4 et des outils associés ;
3. proposer l’arborescence finale ;
4. identifier clairement ce qui fonctionnera localement et ce qui dépendra de GitHub/Jira/Confluence ;
5. créer `docs/IMPLEMENTATION_PLAN.md` ;
6. créer `docs/README.md` servant d’index documentaire.

Ensuite présente-moi brièvement le plan.

Ne commence pas encore l’implémentation complète de l’application tant que cette phase d’architecture n’est pas terminée.