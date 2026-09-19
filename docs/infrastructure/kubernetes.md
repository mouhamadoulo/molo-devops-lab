# Kubernetes local

## Périmètre disponible

`infrastructure/kubernetes/` déploie la stack applicative complète dans le namespace unique
`devops-store` du cluster Kubernetes intégré à Docker Desktop :

| Workload | Type | Service | Stockage |
|---|---|---|---|
| `postgres` | StatefulSet | ClusterIP `5432` | PVC `data-postgres-0`, 2 Gi |
| `object-storage` (AIStor Free) | StatefulSet | NodePort `9000`/`30900`, `9001`/`30901` | PVC `data-object-storage-0`, 2 Gi |
| `backend` | Deployment | ClusterIP `8080`, management `8081` | aucun |
| `frontend` (Nginx) | Deployment | NodePort `8080`/`30080` | aucun |

Les manifests sont des YAML natifs, sans Helm ni Kustomize. Aucune observabilité n'est déployée
dans le cluster : Prometheus, Grafana, Loki et Alloy restent dans le profil Compose
`observability`.

## Prérequis et versions relevées

| Composant | Version | Remarque |
|---|---|---|
| Docker Desktop, moteur | 29.7.2 | Linux `aarch64` |
| Kubernetes | 1.36.1 | mode `kind`, nœud unique `desktop-control-plane` ARM64 |
| containerd | 2.3.1 | magasin d'images distinct du daemon Docker |
| kubectl | 1.36.1 | binaire fourni par Docker Desktop |
| Nœud | Debian 13 (trixie) | noyau `6.6.87.2-microsoft-standard-WSL2` |

Minikube et kind ne publient aucun binaire Windows ARM64 : le cluster intégré à Docker Desktop est
la seule option native sur cette machine.

## Activer le cluster

Dans Docker Desktop : *Settings > Kubernetes > Enable Kubernetes*, mode `kind`, puis *Apply*.
Vérifier ensuite :

```powershell
kubectl config use-context docker-desktop
kubectl wait --for=condition=Ready node --all --timeout=180s
kubectl get nodes -o wide
```

Équivalent Make : `make k8s-cluster`.

## Charger les images applicatives

Le nœud possède son propre magasin containerd : une image présente dans `docker images` n'est pas
visible du cluster. Les manifests référencent `devops-store-backend:local` et
`devops-store-frontend:local` avec `imagePullPolicy: IfNotPresent`.

```powershell
docker compose build --pull
docker save devops-store-backend:local | docker exec -i desktop-control-plane ctr -n k8s.io images import -
docker save devops-store-frontend:local | docker exec -i desktop-control-plane ctr -n k8s.io images import -
docker exec desktop-control-plane ctr -n k8s.io images ls -q
```

Équivalent Make : `make k8s-images`. Les images importées survivent au redémarrage de Docker
Desktop ; les réimporter après chaque rebuild.

## Créer les Secrets

Quatre Secrets existent uniquement dans le cluster. Les fichiers
`infrastructure/kubernetes/examples/*-secret.example.yaml` documentent leurs clés avec des valeurs
vides ; ils ne sont jamais appliqués par `k8s-deploy`.

| Secret | Clés | Source |
|---|---|---|
| `postgres-credentials` | `POSTGRES_PASSWORD` | `DB_PASSWORD` |
| `object-storage-credentials` | `MINIO_ROOT_PASSWORD` | `MINIO_SECRET_KEY` |
| `object-storage-license` | `minio.license` | fichier `MINIO_LICENSE_FILE` |
| `backend-credentials` | `DB_PASSWORD`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `MINIO_SECRET_KEY` | variables du même nom |

Définir les cinq variables dans la session, sans les écrire dans un fichier versionné, puis :

```powershell
make k8s-secrets
```

La cible refuse de s'exécuter si une variable manque et utilise `kubectl create secret ...
--dry-run=client -o yaml | kubectl apply -f -`, donc elle est rejouable. La licence AIStor est
montée en lecture seule sur `/etc/minio-license/minio.license`.

## Déployer et vérifier

```powershell
make k8s-config
make k8s-deploy
make k8s-rollout
make k8s-status
```

`k8s-config` exécute un dry-run client puis serveur ; le namespace est créé avant le dry-run
serveur, qui l'exige. Le backend démarre derrière un initContainer `wait-for-dependencies` qui
attend `postgres:5432` et `object-storage:9000`. Un déploiement à froid prend environ 75 secondes.

Sans GNU Make, les commandes équivalentes sont :

```powershell
kubectl apply -R -f infrastructure/kubernetes/namespace.yaml -f infrastructure/kubernetes/postgres -f infrastructure/kubernetes/object-storage -f infrastructure/kubernetes/backend -f infrastructure/kubernetes/frontend
kubectl rollout status statefulset/postgres -n devops-store --timeout=180s
kubectl rollout status statefulset/object-storage -n devops-store --timeout=180s
kubectl rollout status deployment/backend -n devops-store --timeout=240s
kubectl rollout status deployment/frontend -n devops-store --timeout=120s
kubectl get pods,svc,deployments,statefulsets,pvc -n devops-store
```

## Accès depuis l'hôte

En mode `kind`, Docker Desktop ne publie que l'API server : les NodePorts `30080`, `30900` et
`30901` ne sont pas joignables depuis Windows. L'accès passe par `kubectl port-forward` sur des
ports fixes :

```powershell
make k8s-forward
```

| URL hôte | Cible | Configuration associée |
|---|---|---|
| `http://localhost:8088` | `service/frontend:8080` | `CORS_ALLOWED_ORIGIN=http://localhost:8088` |
| `http://localhost:9000` | `service/object-storage:9000` | `MINIO_PUBLIC_ENDPOINT=http://localhost:9000` |

Avertissements :

- le backend refuse les requêtes d'authentification dont l'en-tête `Origin` diffère de
  `CORS_ALLOWED_ORIGIN` : utiliser exactement `http://localhost:8088`, ou modifier la ConfigMap
  `backend-config` puis redémarrer le backend ;
- les URL présignées des images pointent vers `localhost:9000` : sans la redirection AIStor, la
  galerie affiche des images cassées ;
- le port `9000` est aussi celui d'AIStor dans la stack Compose et de SonarQube par défaut :
  arrêter ces stacks ou déplacer SonarQube avec `SONAR_PORT` ;
- `port-forward` s'attache à un seul pod. Après la suppression ou le redémarrage d'un pod frontend
  ou AIStor, le processus perd sa connexion (`lost connection to pod`) : l'arrêter puis relancer
  `make k8s-forward`.

## Probes

| Workload | startup | readiness | liveness |
|---|---|---|---|
| backend | `/actuator/health/liveness` sur `8081`, 5 s × 30 | `/actuator/health/readiness`, 5 s × 3 | `/actuator/health/liveness`, 10 s × 3 |
| frontend | `GET /` sur `8080`, 3 s × 20 | `GET /`, 5 s × 3 | `GET /`, 10 s × 3 |
| postgres | aucune | `pg_isready`, 5 s × 6 | `pg_isready`, délai 30 s, 10 s × 6 |
| object-storage | `/minio/health/live`, 5 s × 24 | `/minio/health/ready`, 5 s × 3 | `/minio/health/live`, 10 s × 3 |

Ni la liveness ni la readiness du backend ne dépendent de PostgreSQL. Une panne base doit produire
des erreurs HTTP sur les requêtes concernées, pas un redémarrage en cascade des pods backend qui
n'apporterait rien tant que la base est absente. Vérification réelle : PostgreSQL arrêté pendant
136 secondes, soit plus de quatre fois la fenêtre liveness de 30 secondes, sans aucun redémarrage
ni perte de l'état `Ready` du backend.

## Sécurité des pods

- `runAsNonRoot`, UID backend `10001`, frontend `101`, AIStor `1000`, PostgreSQL `999` ;
- `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault` ;
- `readOnlyRootFilesystem: true` pour les quatre workloads, avec des `emptyDir` pour `/tmp` et
  `/var/run/postgresql` ;
- `automountServiceAccountToken: false` : aucun pod n'appelle l'API Kubernetes ;
- requests et limits sur chaque conteneur, initContainer compris ;
- images tierces épinglées par digest.

`make trivy-config` scanne `infrastructure/kubernetes/` avec le reste du dépôt et ne remonte aucune
mauvaise configuration HIGH ou CRITICAL. Les findings restants, hors gate, sont documentés dans
[Trivy](../devops/trivy.md) : UID/GID inférieurs à 10000 imposés par les images, registre
`quay.io` d'AIStor et noms de clés non secrètes comme `DB_USERNAME` dans les ConfigMaps.

## Supprimer ou réinitialiser

| Cible | Effet | Données |
|---|---|---|
| `make k8s-delete` | supprime workloads, Services et ConfigMaps | PVC et Secrets conservés |
| `make k8s-reset` | supprime le namespace | PVC, PV (`reclaimPolicy: Delete`) et Secrets supprimés |

Après `k8s-reset`, rejouer `k8s-secrets`, `k8s-deploy` et `k8s-rollout`. La base repart vide et
Flyway recrée le schéma et les données de démonstration.

## Pannes rencontrées

| Symptôme | Cause | Résolution |
|---|---|---|
| `ErrImagePull` ou `ImagePullBackOff` sur `devops-store-*:local` | image absente du magasin containerd du nœud, tirage tenté sur Docker Hub | `make k8s-images` |
| AIStor en `CrashLoopBackOff`, `mkdirat .../run/secrets/kubernetes.io: read-only file system` | Secret licence monté sur `/run/secrets`, qui masque le point de montage du token ServiceAccount | licence sur `/etc/minio-license`, token désactivé |
| StatefulSet non mis à jour après correction | `OrderedReady` attend que l'ancien pod soit `Ready` | `kubectl delete pod <nom>-0 -n devops-store` |
| `namespaces "devops-store" not found` en dry-run serveur | le dry-run serveur exige un namespace existant | `make k8s-config` crée le namespace d'abord |
| `curl` sur `localhost:8088` retourne une erreur de connexion | `port-forward` arrêté après la suppression de son pod | relancer `make k8s-forward` |
| Docker répond HTTP 500 et `kubectl` échoue en `TLS handshake timeout` | WSL2 figé | redémarrer `WslService` depuis une console administrateur, puis Docker Desktop |
