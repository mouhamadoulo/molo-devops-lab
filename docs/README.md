# Documentation — DevOps Store

Ce dossier contient la documentation détaillée du laboratoire. Le `README.md` à la racine
reste volontairement court et sert uniquement de point d'entrée.

## Disponible

| Document | Rôle |
|---|---|
| [Plan d'implémentation](IMPLEMENTATION_PLAN.md) | Architecture, versions, phases, validations et critères d'acceptation |
| [Cahier des charges](../Prompt-DevSecOps-Lab.md) | Besoin initial et contraintes du laboratoire |
| [Console produits sécurisée](superpowers/specs/2026-08-18-secure-product-console-design.md) | Design validé du frontend, de l'authentification et des images produits |
| [Plan authentification et RBAC](superpowers/plans/2026-08-18-authentication-rbac.md) | JWT, refresh rotatif, rôles et shell Angular sécurisé |
| [Plan images produits S3](superpowers/plans/2026-08-18-product-images-s3.md) | Métadonnées, stockage privé, galerie et cohérence |
| [Plan console produits Angular](superpowers/plans/2026-08-18-angular-product-console.md) | Catalogue responsive, formulaires, galerie et utilisateurs |
| [Contexte produit](../PRODUCT.md) | Public, personnalité, anti-références et principes d'accessibilité de la console |
| [Décision stockage objet](architecture/object-storage-decision.md) | AIStor Free local, licence, sécurité et portabilité S3 |
| [Tests et couverture](devops/testing.md) | Pyramide de tests, rapports JaCoCo/LCOV et scénarios manuels critiques |
| [Images et stack Docker Compose](infrastructure/docker.md) | Images non-root, démarrage local, réseau, santé et dépannage |
| [Workflow Git et GitHub](devops/git-workflow.md) | Branches, commits, Pull Requests, tags, releases et retour arrière |
| [GitHub Actions](devops/github-actions.md) | Workflows CI, artefacts, permissions, secrets et dépannage |
| [SonarQube](devops/sonarqube.md) | Stack qualité locale, analyses backend/frontend, quality gates et CI conditionnelle |
| [Trivy](devops/trivy.md) | Scans du dépôt, des dépendances, des configurations et des images, politique et rapports |
| [JFrog Artifactory](devops/jfrog-artifactory.md) | Artifactory OSS, topologie Maven, publication, promotion et limites de licence |
| [Terraform et JFrog](infrastructure/terraform.md) | Configuration Pro-ready, tests simulés et parcours d’import sous licence |
| [Kubernetes local](infrastructure/kubernetes.md) | Cluster Docker Desktop, manifests, Secrets, accès hôte, probes et nettoyage |
| [Prometheus](observability/prometheus.md) | Scrape interne, PromQL, rétention et exploitation locale |
| [Grafana](observability/grafana.md) | Provisioning versionné, dashboard backend et vérification par API |
| [Loki](observability/loki.md) | Stockage des logs, rétention, LogQL et diagnostic |
| [Alloy](observability/alloy.md) | Collecte des logs Docker par proxy de socket restreint |
| [Design Trivy](superpowers/specs/2026-08-28-trivy-security-design.md) | Périmètre, politique de sécurité, provenance et architecture des scans |
| [Plan Trivy](superpowers/plans/2026-08-29-trivy-security.md) | Exécution et preuves de validation de la phase 8 |

## Architecture

Documents créés pendant les phases application :

- `architecture/overview.md` — vue globale et décisions structurantes ;
- `architecture/frontend.md` — organisation Angular, état et flux UI ;
- `architecture/backend.md` — API, domaine, persistance et erreurs ;
- `architecture/data-flow.md` — parcours d'une requête de bout en bout.

## DevOps

Documents créés pendant les phases d'industrialisation :

- `devops/toolchain.md` — chaîne DevSecOps et diagramme Mermaid ;
- [Workflow Git et GitHub](devops/git-workflow.md) — branches, commits, Pull Requests, tags et releases ;
- [GitHub Actions](devops/github-actions.md) — workflows CI, artefacts, permissions, secrets et dépannage ;
- [SonarQube](devops/sonarqube.md) — analyse qualité locale et CI ;
- [Trivy](devops/trivy.md) — scans filesystem, dépendances, configurations et images ;
- [JFrog Artifactory](devops/jfrog-artifactory.md) — Maven, repositories et limites de licence.

## Infrastructure

- [Images et stack Docker Compose](infrastructure/docker.md) — images, réseau et exploitation locale ;
- [Terraform et JFrog](infrastructure/terraform.md) — configuration Pro-ready, tests simulés et parcours d’import sous licence ;
- [Kubernetes local](infrastructure/kubernetes.md) — déploiement Kubernetes local et gestion des secrets.

## Observabilité

- [Prometheus](observability/prometheus.md) — collecte, requêtes et diagnostic des métriques ;
- [Grafana](observability/grafana.md) — provisioning et dashboard backend ;
- [Loki](observability/loki.md) — stockage, rétention et requêtes LogQL des journaux ;
- [Alloy](observability/alloy.md) — collecte des journaux Docker et proxy de socket restreint.

## Sécurité et dépannage

- `security/security-guidelines.md` — secrets, images, dépendances et configuration ;
- `troubleshooting/common-issues.md` — diagnostics reproductibles et solutions.

## Convention documentaire

- un sujet principal par fichier ;
- commandes copiables et résultats attendus ;
- aucun secret réel ni URL privée ;
- mise à jour du plan après chaque phase ;
- les documents non encore créés sont explicitement présentés ci-dessus comme planifiés.
