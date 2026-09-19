# Design — Déploiement Kubernetes local

- **Date :** 17 septembre 2026
- **Statut :** proposé, à valider en conversation
- **Périmètre :** phase 13, cluster Kubernetes local de Docker Desktop, manifests YAML bruts pour
  PostgreSQL, AIStor, backend et frontend

## Contexte

Les phases 4 à 12 ont livré une stack Docker Compose complète : PostgreSQL 18.4, AIStor Free,
backend Spring Boot 4.1.1 et frontend Angular servi par Nginx, avec healthchecks, runtimes
non-root, systèmes de fichiers en lecture seule, limites de ressources, puis SonarQube, Trivy,
Artifactory, Terraform, Prometheus, Grafana, Loki et Alloy. La phase 13 ajoute une seconde cible
d'exécution : un cluster Kubernetes local.

Contraintes relevées dans le dépôt avant conception :

- `ObjectStorageInitializer` est un `ApplicationRunner` qui appelle `ensureBucket()` au démarrage.
  Si AIStor n'est pas joignable, le démarrage du backend échoue. L'ordonnancement des workloads
  n'est donc pas optionnel.
- `frontend/nginx.conf` route `/api/` vers `http://backend:8080` en dur. Un Service Kubernetes
  nommé `backend` dans le même namespace satisfait cette résolution sans modifier l'image.
- La `Content-Security-Policy` du frontend limite `img-src` à `'self'`, `data:`, `blob:`,
  `http://localhost:*` et `http://127.0.0.1:*`. Les images produits étant servies par des URLs
  présignées AIStor construites depuis `MINIO_PUBLIC_ENDPOINT`, l'accès hôte doit rester sur
  `localhost` ou `127.0.0.1`.
- Le backend expose Actuator sur le port management `8081`, avec
  `management.endpoint.health.probes.enabled: true` : `/actuator/health/liveness` et
  `/actuator/health/readiness` sont déjà disponibles.
- La licence AIStor Free est un fichier local hors Git, monté en lecture seule sur
  `/etc/minio-license/minio.license` : un Secret monté sur `/run/secrets` masquerait le point de
  montage du token ServiceAccount et empêcherait le conteneur de démarrer. Aucun pod n'appelle
  l'API Kubernetes : `automountServiceAccountToken: false` sur les quatre workloads.
- Outillage local au moment de la conception : `kubectl` v1.36.1 avec Kustomize v5.8.1, Docker
  29.7.2. `helm` est absent du `PATH`. L'hôte est une machine Windows ARM64 : aucun binaire
  Windows ARM64 de Minikube ou de kind n'est publié, et le Kubernetes intégré de Docker Desktop est
  le seul cluster local disponible (voir la décision 2).

## Objectifs

- déployer la stack applicative complète sur un cluster Kubernetes local et persistant ;
- garder les manifests lisibles et applicables par `kubectl apply -R -f`, sans outil supplémentaire ;
- reproduire le durcissement du Compose : non-root, capacités supprimées, systèmes de fichiers en
  lecture seule quand l'image le supporte, requests et limits explicites ;
- garantir qu'aucune valeur secrète réelle n'entre dans Git ;
- placer les probes au bon niveau de santé, sans dépendance à PostgreSQL ni redémarrage en cascade ;
- assurer la persistance du schéma et des données après recréation des pods ;
- fournir des commandes Make et une documentation permettant de démarrer, observer, exposer et
  nettoyer le cluster.

## Hors périmètre

- observabilité dans le cluster : Prometheus, Grafana, Loki et Alloy restent en Docker Compose et
  ne scrutent pas les workloads Kubernetes ;
- Ingress, TLS, noms de domaine locaux et addons de distribution ;
- Helm, Kustomize, opérateurs et GitOps ;
- HPA, PodDisruptionBudget, NetworkPolicy et multi-réplica ;
- distribution des images par un registre : Artifactory OSS n'héberge aujourd'hui que du Maven ;
- toute modification du code applicatif backend ou frontend.

## Décisions validées

1. **Périmètre des workloads.** PostgreSQL, AIStor, backend et frontend sont tous déployés dans le
   cluster. Écarté : désactiver la galerie, qui casserait l'upload d'images ; pointer vers l'AIStor
   de l'hôte, qui couplerait le cluster à la machine hôte.
2. **Distribution du cluster.** Le Kubernetes intégré de Docker Desktop est utilisé, afin que les
   critères d'acceptation dynamiques soient réellement exécutés. Minikube a d'abord été installé
   (v1.38.1) puis écarté : le projet ne publie aucun binaire Windows ARM64, et le binaire x64
   provisionne une image `kicbase` amd64 émulée dans laquelle le daemon Docker interne ne démarre
   pas (`GUEST_NOT_FOUND`). kind présente la même absence de binaire Windows ARM64. Docker Desktop
   exécute son cluster en mode `kind` sur un nœud unique ARM64 natif. Sa version réelle est relevée
   et inscrite dans la documentation et le socle de versions. Le cluster n'a pas de commande CLI de
   démarrage ou d'arrêt : son cycle de vie appartient à Docker Desktop, et `make k8s-cluster` se
   limite donc à vérifier que le contexte `docker-desktop` répond et que le nœud est `Ready`.
3. **Format des manifests.** YAML brut organisé en sous-dossiers par workload, conformément au texte
   du plan. Écartés : Kustomize et Helm, qui ajoutent une indirection sans besoin actuel.
4. **Exposition.** Services `NodePort` déclarés pour le frontend et AIStor, accès pratique par
   `kubectl port-forward` sur des ports fixes.
5. **Images.** `make build` produit les images locales. Le nœud du cluster possède son propre
   magasin containerd, distinct de celui du daemon Docker : les images y sont injectées par
   `docker save <image> | docker exec -i desktop-control-plane ctr -n k8s.io images import -`,
   avec `imagePullPolicy: IfNotPresent`.
6. **Observabilité.** Aucun composant d'observabilité n'est déployé ni recablé dans cette phase.

## Architecture

Namespace unique `devops-store`.

| Workload | Type | Stockage | Service |
| --- | --- | --- | --- |
| `postgres` | StatefulSet, 1 réplica | PVC 2Gi par `volumeClaimTemplates` | ClusterIP `postgres:5432` |
| `object-storage` | StatefulSet, 1 réplica | PVC 2Gi par `volumeClaimTemplates` | ClusterIP `object-storage:9000`, NodePort `30900` |
| `backend` | Deployment, 1 réplica | `emptyDir` sur `/tmp` | ClusterIP `backend:8080`, port management `8081` |
| `frontend` | Deployment, 1 réplica | `emptyDir` sur `/tmp` | NodePort `30080` vers `8080` |

AIStor est un StatefulSet et non un Deployment : identité stable, PVC lié au pod, et surtout
`fsGroup: 1000` sur le pod, ce qui donne au volume le bon propriétaire et remplace le conteneur
`object-storage-permissions` du Compose.

Le pod backend porte un initContainer `wait-for-dependencies` qui vérifie l'ouverture des ports TCP
`postgres:5432` et `object-storage:9000` avant de laisser démarrer le conteneur principal. Sans lui,
l'échec de `ensureBucket()` provoquerait une boucle de CrashLoopBackOff au premier démarrage.

Flux : navigateur → `port-forward` → Service `frontend` → Nginx → `http://backend:8080` → Service
`backend` → pod backend → Services `postgres` et `object-storage`. Les URLs présignées d'images
pointent vers `MINIO_PUBLIC_ENDPOINT`, joint depuis le navigateur par le second `port-forward`.

## Configuration et secrets

ConfigMaps versionnées, sans aucune valeur sensible :

- `postgres-config` : `POSTGRES_DB`, `POSTGRES_USER` ;
- `object-storage-config` : `MINIO_ROOT_USER`, adresse de console ;
- `backend-config` : `DB_URL=jdbc:postgresql://postgres:5432/devops_store`, `DB_USERNAME`,
  `MANAGEMENT_SERVER_PORT=8081`, `JWT_ISSUER`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`,
  `AUTH_COOKIE_SECURE=false`, `MINIO_ENDPOINT=http://object-storage:9000`, `MINIO_ACCESS_KEY`,
  `MINIO_BUCKET`, `MINIO_REGION`, `MINIO_INITIALIZE_BUCKET=true`, `MINIO_ORPHAN_MIN_AGE`,
  `MINIO_ORPHAN_RECONCILIATION_INTERVAL`, `CORS_ALLOWED_ORIGIN=http://localhost:8088`,
  `MINIO_PUBLIC_ENDPOINT=http://localhost:9000`.

Secrets créés à la main ou par `make k8s-secrets`, jamais versionnés :

```powershell
kubectl create secret generic postgres-credentials -n devops-store `
  --from-literal=POSTGRES_PASSWORD=...
kubectl create secret generic backend-credentials -n devops-store `
  --from-literal=DB_PASSWORD=... `
  --from-literal=JWT_SECRET=... `
  --from-literal=BOOTSTRAP_ADMIN_PASSWORD=... `
  --from-literal=MINIO_SECRET_KEY=...
kubectl create secret generic object-storage-credentials -n devops-store `
  --from-literal=MINIO_ROOT_PASSWORD=...
kubectl create secret generic object-storage-license -n devops-store `
  --from-file=minio.license=$env:MINIO_LICENSE_FILE
```

Le dépôt ne contient qu'un `secret.example.yaml` par workload, avec des valeurs vides et la commande
de création en commentaire, sur le modèle de `.env.example`. Deux paires de clés portent la même
valeur, comme en Compose, mais vivent dans des Secrets distincts, chaque workload ne montant que le
sien : `DB_PASSWORD` du backend avec `POSTGRES_PASSWORD` de la base, et `MINIO_SECRET_KEY` du
backend avec `MINIO_ROOT_PASSWORD` d'AIStor.

`make k8s-secrets` lit les variables d'environnement de la session et échoue explicitement si l'une
d'elles manque. Il ne génère ni ne devine aucune valeur.

## Exposition depuis l'hôte

Le nœud du cluster est un conteneur sur un réseau Docker interne, dont l'IP n'est pas routable
depuis Windows. L'origine réellement vue par le navigateur dépend donc du mode d'accès, et une
ConfigMap versionnée ne peut pas contenir une origine dont le port varie.

La phase déclare donc les Services `NodePort` — contrat Kubernetes versionné, ports `30080` et
`30900` — mais l'accès de travail passe par `make k8s-forward`, qui ouvre deux `kubectl port-forward`
sur des ports fixes :

- `127.0.0.1:8088` → Service `frontend` ;
- `127.0.0.1:9000` → Service `object-storage`.

Ces deux valeurs correspondent exactement à `CORS_ALLOWED_ORIGIN` et `MINIO_PUBLIC_ENDPOINT`, et la
CSP du frontend accepte déjà `http://localhost:*` pour `img-src` : la galerie fonctionne sans
modifier l'image.

Tout autre mode d'accès est documenté avec le même avertissement : si l'origine vue par le
navigateur ne correspond pas à `CORS_ALLOWED_ORIGIN`, elle ne convient qu'à un affichage rapide de
la page, pas au parcours authentifié — `AuthCookieService.validate` exige un en-tête `Origin`
autorisé.

Le port 9000 est partagé avec l'AIStor du Compose et avec SonarQube. La documentation impose
d'arrêter la stack Compose avant `make k8s-forward` ; les deux cibles d'exécution ne sont pas
prévues pour coexister.

## Santé et probes

Backend, toutes les probes sur le port management `8081` :

| Probe | Chemin | Réglage |
| --- | --- | --- |
| startup | `/actuator/health/liveness` | `periodSeconds: 5`, `failureThreshold: 30` |
| liveness | `/actuator/health/liveness` | `periodSeconds: 10`, `failureThreshold: 3` |
| readiness | `/actuator/health/readiness` | `periodSeconds: 5`, `failureThreshold: 3` |

Le groupe `readiness` de Spring Boot contient par défaut `readinessState` seul et n'inclut pas
l'indicateur `db`. Ni la liveness ni la readiness ne dépendent donc de PostgreSQL, et aucune
modification d'`application.yml` n'est nécessaire. Conséquence assumée et documentée : pendant une
panne de base, le pod backend reste `Ready` et renvoie des erreurs applicatives, visibles dans les
logs, plutôt que de disparaître des endpoints ou de redémarrer.

Autres workloads :

- `postgres` : `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` en `exec`, en readiness et en liveness ;
- `object-storage` : `GET /minio/health/live` en liveness, `GET /minio/health/ready` en readiness ;
- `frontend` : `GET /` sur `8080` en startup, readiness et liveness.

## Sécurité et ressources

`securityContext` commun : `runAsNonRoot: true`, `allowPrivilegeEscalation: false`,
`capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`. UIDs repris du Compose : backend
`10001`, frontend `101`, AIStor `1000` avec `fsGroup: 1000`, PostgreSQL `999` avec `fsGroup: 999`.

`readOnlyRootFilesystem: true` pour les quatre workloads, avec des `emptyDir` sur `/tmp`
dimensionnés comme les `tmpfs` du Compose. PostgreSQL reçoit en plus un `emptyDir` sur
`/var/run/postgresql` : l'image 18.4-alpine initialise, écrit et redémarre sans erreur avec une
racine en lecture seule, ce qui satisfait le contrôle Trivy `KSV-0014` (HIGH).

Requests et limits alignées sur les limites du Compose, requests à environ la moitié des limits :

| Workload | requests | limits |
| --- | --- | --- |
| `postgres` | 250m / 256Mi | 1000m / 512Mi |
| `object-storage` | 250m / 512Mi | 1000m / 1Gi |
| `backend` | 500m / 512Mi | 1000m / 768Mi |
| `frontend` | 100m / 64Mi | 500m / 128Mi |

Toutes les images sont épinglées par digest, y compris celle de l'initContainer, faute de quoi le
scan Trivy des configurations remonterait une misconfiguration.

## Arborescence

```
infrastructure/kubernetes/
  namespace.yaml
  postgres/
    configmap.yaml
    secret.example.yaml
    statefulset.yaml
    service.yaml
  object-storage/
    configmap.yaml
    secret.example.yaml
    statefulset.yaml
    service.yaml
  backend/
    configmap.yaml
    secret.example.yaml
    deployment.yaml
    service.yaml
  frontend/
    deployment.yaml
    service.yaml
```

## Commandes Make

`k8s-start` démarre le cluster ; `k8s-config` valide les manifests en `--dry-run=server` ;
`k8s-images` construit les images et les charge dans le cluster ; `k8s-secrets` crée les quatre
Secrets depuis l'environnement ; `k8s-deploy` applique les manifests ; `k8s-rollout` attend que les
workloads soient Ready ; `k8s-status` affiche pods, services, déploiements, StatefulSets et PVC ;
`k8s-forward` ouvre les deux redirections de ports ; `k8s-logs` suit les journaux ; `k8s-delete`
supprime les workloads en conservant les PVC ; `k8s-reset` supprime aussi les PVC et le namespace ;
`k8s-stop` arrête le cluster sans le détruire.

## Validation

Statique, exécutable sans cluster :

```powershell
git diff --check
kubectl apply --dry-run=client -R -f infrastructure/kubernetes
```

Statique, avec cluster démarré :

```powershell
kubectl apply --dry-run=server -R -f infrastructure/kubernetes
```

Le scan Trivy des configurations couvre désormais `infrastructure/kubernetes` et doit rester sans
misconfiguration HIGH ou CRITICAL.

Acceptation dynamique, une manipulation par critère du plan :

1. **Stabilité** — tous les workloads deviennent `Ready` ; `kubectl delete pod` sur le backend puis
   sur le frontend ; `kubectl rollout status` repasse Ready sans intervention.
2. **Persistance** — création d'un produit par l'API, suppression du pod PostgreSQL, vérification que
   le schéma Flyway et le produit sont toujours présents après recréation.
3. **Secrets** — recherche des valeurs sensibles dans le dépôt et dans les manifests : zéro
   occurrence ; `kubectl get secret` confirme leur existence uniquement dans le cluster.
4. **Niveau des probes** — `kubectl scale statefulset/postgres --replicas=0`, relevé du
   `restartCount` du pod backend avant et pendant la panne : il ne doit pas augmenter ; remontée de
   PostgreSQL et retour au fonctionnement nominal.

## Modes de défaillance anticipés

- **AIStor indisponible au premier démarrage** : l'initContainer bloque le backend jusqu'à
  l'ouverture du port, ce qui évite la boucle de CrashLoopBackOff due à `ensureBucket()`.
- **Licence AIStor absente ou illisible** : le pod `object-storage` ne démarre pas ; la
  documentation indique la commande de création du Secret depuis le fichier de licence.
- **Conflit sur le port 9000** : `port-forward` échoue si la stack Compose ou SonarQube tourne ; la
  documentation impose de les arrêter d'abord.
- **Image absente du cluster** : `imagePullPolicy: IfNotPresent` avec une image locale non chargée
  produit un `ErrImageNeverPull` ou un `ImagePullBackOff` ; `make k8s-images` doit précéder
  `make k8s-deploy`.
- **PVC conservé entre deux déploiements** : un changement de mot de passe PostgreSQL après création
  du volume n'est pas pris en compte par `initdb` ; `make k8s-reset` est la procédure documentée.

## Documentation

`docs/infrastructure/kubernetes.md` couvre les prérequis, l'activation du Kubernetes de Docker
Desktop, la création
des Secrets, le déploiement, l'accès, les probes et leur justification, le nettoyage des PVC et les
pannes réellement rencontrées. L'index `docs/README.md`, la liste des commandes d'`AGENTS.md`, le
socle de versions et les cases de `docs/IMPLEMENTATION_PLAN.md` sont mis à jour en fin de phase.
