# Services, accès et nettoyage

Inventaire de ce qui tourne en local : comment démarrer et arrêter chaque stack, sur quelle URL
la joindre, d'où viennent ses identifiants initiaux et ce que le laboratoire ne peut pas faire.
Aucune valeur secrète ne figure ici : toutes viennent de `.env`, lui-même hors Git.

## Stacks

| Stack | Démarrer | Arrêter en gardant les données | Réinitialiser |
|---|---|---|---|
| Application | `make application` (build puis `make up`, soit `docker compose up -d`) | `make down` | `docker compose down -v` |
| Qualité (SonarQube) | `make quality-up` | `make quality-down` | `make quality-reset` |
| Artefacts (Artifactory OSS) | `make artifacts-up` | `make artifacts-down` | `make artifacts-reset` |
| Registre (JCR, optionnel) | `make registry-up` | `make registry-down` | `make registry-reset` |
| Observabilité | `make observability-up` | `make observability-down` | `make observability-reset` |
| Kubernetes | `make k8s-deploy` puis `make k8s-rollout` | `make k8s-delete` (conserve les PVC et les Secrets) | `make k8s-reset` (supprime le namespace et ses volumes) |

`down`, `quality-down`, `artifacts-down`, `registry-down` et `observability-down` préservent les
volumes nommés. Les cibles `*-reset` détruisent les données locales : mots de passe de base,
projets SonarQube, artefacts publiés et dashboards repartent de zéro au démarrage suivant.

Le profil observabilité démarre aussi l'application : `make observability-up` suppose que les
variables de `.env` sont renseignées.

## URL et ports

| Service | URL hôte | Variable de port | Stack |
|---|---|---|---|
| Frontend | <http://localhost:4200> | `FRONTEND_PORT` | Application |
| Backend (API) | <http://localhost:8080/api/v1/products> | `BACKEND_PORT` | Application |
| Swagger UI | <http://localhost:8080/swagger-ui.html> | `BACKEND_PORT` | Application |
| Actuator | interne `8081`, **non publié** | — | Application |
| AIStor (API S3) | <http://localhost:9000> | `MINIO_API_PORT` | Application |
| AIStor (console) | <http://localhost:9001> | `MINIO_CONSOLE_PORT` | Application |
| PostgreSQL | `localhost:5432` | `POSTGRES_PORT` | Application |
| SonarQube | <http://localhost:9000> | `SONAR_PORT` | Qualité |
| Artifactory | <http://localhost:8082/ui/> | `ARTIFACTORY_PORT` | Artefacts |
| JCR | <http://localhost:8084> | `JCR_PORT` | Registre |
| Prometheus | <http://localhost:9090> | `PROMETHEUS_PORT` | Observabilité |
| Grafana | <http://localhost:3000> | `GRAFANA_PORT` | Observabilité |
| Loki | <http://localhost:3100> | `LOKI_PORT` | Observabilité |
| Alloy | <http://localhost:12345> | `ALLOY_PORT` | Observabilité |
| Frontend Kubernetes | <http://localhost:8088> après `make k8s-forward` | `K8S_FRONTEND_PORT` | Kubernetes |
| AIStor Kubernetes | `localhost:9000` après `make k8s-forward` | `K8S_STORAGE_PORT` | Kubernetes |

Tous les ports publiés sont liés à `127.0.0.1` : rien n'est exposé au réseau local. Actuator n'est
joignable que depuis le réseau Compose.

**Conflits sur le port 9000.** Trois services le revendiquent par défaut : AIStor de la stack
applicative, SonarQube du profil qualité et la redirection AIStor de Kubernetes. Ils ne peuvent pas
tourner ensemble tels quels : déplacer SonarQube avec `SONAR_PORT`, ou arrêter la stack applicative
avant un `make k8s-forward`.

Les NodePorts déclarés par les manifests Kubernetes ne sont **pas** joignables depuis Windows ;
seul `make k8s-forward` donne accès, voir [Kubernetes local](../infrastructure/kubernetes.md).

## Identifiants initiaux

| Compte | Origine | Comment le changer |
|---|---|---|
| Administrateur applicatif | `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`, créé au premier démarrage sur une base vide | via l'administration des utilisateurs de la console |
| PostgreSQL applicatif | `DB_USERNAME` / `DB_PASSWORD` | figés dans le volume au premier démarrage : changer la variable **et** réinitialiser le volume |
| PostgreSQL SonarQube / Artifactory / JCR | `SONAR_DB_PASSWORD`, `ARTIFACTORY_DB_PASSWORD`, `JCR_DB_PASSWORD` | idem, via la cible `*-reset` correspondante |
| AIStor | `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | figés dans le volume au premier démarrage |
| SonarQube (interface) | compte par défaut `admin` / `admin` | mot de passe à remplacer à la première connexion, voir [SonarQube](../devops/sonarqube.md) |
| Artifactory (interface) | compte administrateur par défaut | mot de passe à remplacer à la première connexion, puis générer un identity token, voir [JFrog Artifactory](../devops/jfrog-artifactory.md) |
| Grafana | `GRAFANA_ADMIN_PASSWORD`, obligatoire | figé dans le volume au premier démarrage, voir [Grafana](../observability/grafana.md) |
| Secrets Kubernetes | créés hors Git par `make k8s-secrets` depuis l'environnement | relancer `make k8s-secrets` puis redémarrer les workloads |

Le fichier de licence AIStor (`MINIO_LICENSE_FILE`) est téléchargé séparément et n'est jamais
versionné. Les jetons `SONAR_TOKEN`, `JFROG_ADMIN_TOKEN` et `JFROG_TOKEN` sont fournis par
l'environnement au moment de la commande.

## Limites locales, externes et de licence

- **AIStor Free** : single-node uniquement, sans SLA ni SLO, et une licence locale est requise même
  pour les tests d'intégration.
- **Artifactory OSS** : pas d'API de configuration des repositories ni de copie ; ils sont créés une
  fois dans l'interface puis vérifiés par `make artifacts-verify`. Terraform reste donc limité aux
  tests simulés.
- **Kubernetes** : un seul nœud, pas de haute disponibilité, NodePorts injoignables depuis Windows,
  images à importer dans le magasin containerd du nœud par `make k8s-images`.
- **CI** : les workflows tournent sur GitHub ; il n'y a pas de runner local équivalent.
- **Jira et Confluence** : aucun compte rattaché, l'alimentation passe par un import CSV et une
  copie manuelle, voir [Jira et Confluence](../planning/jira-confluence.md).
- **Ports** : tout est lié à `127.0.0.1` ; aucune stack n'est prévue pour être exposée hors du poste.
