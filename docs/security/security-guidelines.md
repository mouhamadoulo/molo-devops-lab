# Règles de sécurité

Règles appliquées dans ce dépôt, avec l'endroit où chacune se vérifie. Elles complètent la
politique de scan de [Trivy](../devops/trivy.md) et les choix décrits dans la
[vue d'ensemble de l'architecture](../architecture/overview.md).

## Secrets

Aucune valeur secrète n'est versionnée, quelle que soit sa durée de vie.

| Secret | Où il vit | Jamais dans Git |
|---|---|---|
| `DB_PASSWORD`, `MINIO_SECRET_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD` | `.env` local, non suivi | oui |
| `GRAFANA_ADMIN_PASSWORD`, `SONAR_DB_PASSWORD`, `ARTIFACTORY_DB_PASSWORD`, `JCR_DB_PASSWORD` | `.env` local | oui |
| `SONAR_TOKEN`, `JFROG_ADMIN_TOKEN`, `JFROG_TOKEN`, `TF_VAR_artifactory_access_token` | variables d'environnement fournies à la commande, secrets GitHub en CI | oui |
| Licence AIStor (`MINIO_LICENSE_FILE`) | fichier téléchargé localement, chemin passé par variable | oui |
| Secrets Kubernetes | créés par `make k8s-secrets` depuis l'environnement, dans le cluster seulement | oui |

- `.env.example` liste toutes les variables et laisse **vides** celles qui portent un secret.
- `infrastructure/kubernetes/examples/` contient des Secrets à valeurs vides, présents pour
  documenter la forme attendue ; ils ne sont jamais appliqués.
- Le scanner de secrets de Trivy parcourt le dépôt à chaque `make trivy-fs` et en CI ; une
  détection est bloquante au même titre qu'une vulnérabilité `HIGH`.
- Un secret exposé par erreur est considéré comme compromis : on le remplace, on ne se contente
  pas de le retirer de l'historique.

## Images et conteneurs

- Tags explicites **épinglés par digest** dans les Dockerfiles, Compose, les manifests Kubernetes,
  le `Makefile` et les workflows ; `latest` est interdit dans les fichiers versionnés.
- Les actions GitHub sont elles aussi épinglées par SHA, avec le numéro de version en commentaire.
- Runtimes non-root : UID 10001 pour le backend, UID 101 pour `nginx-unprivileged`.
- Côté Kubernetes, les pods tournent avec `readOnlyRootFilesystem: true`, toutes les capacités
  supprimées et `automountServiceAccountToken: false` ; les répertoires inscriptibles sont des
  `emptyDir` explicites.
- La provenance de l'image Trivy est vérifiée par Cosign avant tout scan (`make trivy-verify`),
  sur l'identité de workflow et l'émetteur OIDC de GitHub.
- Les images applicatives sont scannées après build par `make trivy-images`.

## Dépendances

- Dependabot suit les dépendances Maven, npm, les actions GitHub et les images de base.
- Le gate de sécurité bloque les vulnérabilités `HIGH` et `CRITICAL` **corrigibles**
  (`ignore-unfixed: true`) ; secrets et mauvaises configurations gardent le même seuil.
- Deux surcharges sont en place dans `backend/pom.xml`, chacune justifiée par un commentaire :

| Surcharge | Version forcée | Raison |
|---|---|---|
| Tomcat embarqué | 11.0.25 | Spring Boot 4.1.1 fournit encore 11.0.24, signalé en critique |
| `bcprov-jdk18on` | 1.86 | MinIO 9.0.3 tire encore 1.84 (CVE-2026-8763, CVE-2026-13506), corrigé par la PR #45 |

- Règle de sortie : une surcharge est **retirée** dès que le BOM ou la dépendance amont fournit la
  version corrigée. Elle n'est pas conservée « au cas où ».
- Les mises à jour Dependabot vers un JDK non LTS sont refusées ; seule la version Maven de l'image
  de build est reprise, sur une variante JDK 25.

## Surfaces exposées

- Tous les ports publiés sont liés à `127.0.0.1` ; rien n'est offert au réseau local, voir
  [Services et accès](../operations/services.md).
- Actuator est limité à `health`, `info` et `prometheus`, sur le port de management `8081` qui
  n'est pas publié sur l'hôte. Ajouter un endpoint exige une justification écrite.
- CORS n'autorise qu'une seule origine, `CORS_ALLOWED_ORIGIN`.
- `login`, `refresh` et `logout` vérifient que l'en-tête `Origin` est exactement cette origine ;
  `refresh` et `logout` exigent en plus la concordance du cookie `XSRF-TOKEN` et de l'en-tête
  `X-XSRF-TOKEN`, comparés à temps constant.
- Le jeton de rafraîchissement vit dans un cookie `HttpOnly`, `SameSite=Strict`, limité au chemin
  `/api/v1/auth`, et n'est stocké qu'en condensé SHA-256. Le JWT d'accès reste en mémoire côté
  navigateur.
- Les objets du stockage ne sont jamais publics : ils sortent par URL présignée de cinq minutes.
- Alloy ne monte **jamais** le socket Docker ; seul `socket-proxy` le fait, en lecture seule et
  avec une allowlist de routes, voir [Alloy](../observability/alloy.md).
- Aucun token de ServiceAccount n'est monté dans les pods.

## Exceptions

Une exception de scan suit la [politique d'exception](../devops/trivy.md#politique-dexception) :
identifiant exact, chemin ou paquet, justification, responsable, date d'expiration et approbation
explicite. Un `.trivyignore.yaml` ne doit jamais servir à faire passer un gate.

Les findings Kubernetes de sévérité inférieure au gate (`KSV-0020`, `KSV-0021`, `KSV-0125`,
`KSV-01010`, `DS-0026`) sont acceptés et documentés dans [Trivy](../devops/trivy.md), avec pour
chacun la raison de l'acceptation.
