# Documentation — DevOps Store

Ce dossier contient la documentation détaillée du laboratoire. Le `README.md` à la racine
reste volontairement court et sert uniquement de point d'entrée.

## Disponible

| Document | Rôle |
|---|---|
| [Plan d'implémentation](IMPLEMENTATION_PLAN.md) | Architecture, versions, phases, validations et critères d'acceptation |
| [Cahier des charges](../Prompt-DevSecOps-Lab.md) | Besoin initial et contraintes du laboratoire |

## Architecture

Documents créés pendant les phases application :

- `architecture/overview.md` — vue globale et décisions structurantes ;
- `architecture/frontend.md` — organisation Angular, état et flux UI ;
- `architecture/backend.md` — API, domaine, persistance et erreurs ;
- `architecture/data-flow.md` — parcours d'une requête de bout en bout.

## DevOps

Documents créés pendant les phases d'industrialisation :

- `devops/toolchain.md` — chaîne DevSecOps et diagramme Mermaid ;
- `devops/git-workflow.md` — branches, commits, Pull Requests, tags et releases ;
- `devops/github-actions.md` — workflows CI et secrets ;
- `devops/sonarqube.md` — analyse qualité locale et CI ;
- `devops/trivy.md` — scans filesystem, dépendances, images et IaC ;
- `devops/jfrog-artifactory.md` — Maven, repositories et limites de licence.

## Infrastructure

- `infrastructure/docker.md` — images et stacks Docker Compose ;
- `infrastructure/terraform.md` — configuration JFrog avec Terraform ;
- `infrastructure/kubernetes.md` — déploiement Minikube et gestion des secrets.

## Observabilité

- `observability/prometheus.md` — collecte des métriques ;
- `observability/grafana.md` — provisioning et dashboards ;
- `observability/loki.md` — collecte et requêtes de logs avec Alloy et Loki.

## Sécurité et dépannage

- `security/security-guidelines.md` — secrets, images, dépendances et configuration ;
- `troubleshooting/common-issues.md` — diagnostics reproductibles et solutions.

## Convention documentaire

- un sujet principal par fichier ;
- commandes copiables et résultats attendus ;
- aucun secret réel ni URL privée ;
- mise à jour du plan après chaque phase ;
- les documents non encore créés sont explicitement présentés ci-dessus comme planifiés.
