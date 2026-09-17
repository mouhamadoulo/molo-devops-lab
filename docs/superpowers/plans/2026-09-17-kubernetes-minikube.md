# Kubernetes et Minikube — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** déployer PostgreSQL, AIStor, le backend Spring Boot et le frontend Nginx sur un cluster Minikube local, avec manifests YAML versionnés, secrets hors Git, probes correctes et commandes Make.

**Architecture:** namespace unique `devops-store` ; PostgreSQL et AIStor en StatefulSet avec PVC ; backend et frontend en Deployment ; un initContainer sérialise le démarrage du backend derrière ses deux dépendances ; accès hôte par `kubectl port-forward` sur des ports fixes alignés avec `CORS_ALLOWED_ORIGIN` et `MINIO_PUBLIC_ENDPOINT`.

**Tech Stack:** Minikube (driver Docker), kubectl 1.36.1, YAML brut, images locales `devops-store-backend:local` et `devops-store-frontend:local`, PostgreSQL 18.4-alpine, AIStor Free, GNU Make.

**Spec:** `docs/superpowers/specs/2026-09-17-kubernetes-minikube-design.md`

## Global Constraints

- Namespace unique : `devops-store`.
- Aucune valeur secrète réelle dans Git. Seuls des `secret.example.yaml` à valeurs vides sont versionnés.
- Aucune modification du code applicatif backend ou frontend, ni de `frontend/nginx.conf`, ni de `backend/src/main/resources/application.yml`.
- Toutes les images tierces sont épinglées par digest. PostgreSQL : `postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`. AIStor : `quay.io/minio/aistor/minio:RELEASE.2026-04-14T21-32-45Z@sha256:3fe2c9acc9bf79ce982fa61d4befb97556a34e44e278395152ed54de471bb95d`.
- Images applicatives : `devops-store-backend:local` et `devops-store-frontend:local`, `imagePullPolicy: IfNotPresent`, chargées par `minikube image load`.
- `securityContext` de tous les pods : `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`.
- UIDs : backend `10001`, frontend `101`, AIStor `1000` (`fsGroup: 1000`), PostgreSQL `999` (`fsGroup: 999`).
- `readOnlyRootFilesystem: true` partout sauf PostgreSQL.
- Ports fixes côté hôte : frontend `127.0.0.1:8088`, AIStor `127.0.0.1:9000`.
- NodePorts déclarés : frontend `30080`, AIStor API `30900`, AIStor console `30901`.
- Aucune probe, ni liveness ni readiness, ne doit dépendre de PostgreSQL.
- Toutes les commandes sont exécutées depuis la racine du worktree, en PowerShell 5.1 : pas de `&&`, une commande par ligne.
- Commits : messages courts en anglais, sans mention d'assistance IA, sans trailer `Co-Authored-By`, sans `--author`.

---

### Task 0: Worktree, branche et fichiers de suivi

**Files:**
- Create: `.worktrees/phase-13-kubernetes/` (worktree, ignoré par Git)
- Move: `docs/superpowers/specs/2026-09-17-kubernetes-minikube-design.md` depuis le checkout principal vers le worktree
- Create: `docs/superpowers/plans/2026-09-17-kubernetes-minikube.md` (ce fichier, dans le worktree)

**Interfaces:**
- Consumes: rien.
- Produces: un worktree `.worktrees/phase-13-kubernetes` sur la branche `feat/phase-13-kubernetes`, contenant la spec et le plan committés. Toutes les tâches suivantes s'exécutent dans ce répertoire.

- [ ] **Step 1: Vérifier que `main` est propre et à jour**

```powershell
git -C C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab status --short --branch
git -C C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab fetch origin
```

Attendu : seuls la spec et le plan apparaissent comme fichiers non suivis (`?? docs/superpowers/`), branche `main` synchronisée avec `origin/main`.

- [ ] **Step 2: Créer le worktree et la branche**

```powershell
git -C C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab worktree add -b feat/phase-13-kubernetes .worktrees\phase-13-kubernetes origin/main
```

Attendu : `Preparing worktree` puis `HEAD is now at 6f512b8`.

- [ ] **Step 3: Déplacer la spec et le plan dans le worktree**

Déplacer les deux fichiers non suivis du checkout principal vers le worktree, puis vérifier que le checkout principal est redevenu propre :

```powershell
Move-Item docs\superpowers\specs\2026-09-17-kubernetes-minikube-design.md .worktrees\phase-13-kubernetes\docs\superpowers\specs\
Move-Item docs\superpowers\plans\2026-09-17-kubernetes-minikube.md .worktrees\phase-13-kubernetes\docs\superpowers\plans\
git -C C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab status --short
```

Attendu : sortie vide pour le checkout principal.

- [ ] **Step 4: Committer spec et plan dans le worktree**

```powershell
Set-Location C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab\.worktrees\phase-13-kubernetes
git add docs/superpowers/specs/2026-09-17-kubernetes-minikube-design.md docs/superpowers/plans/2026-09-17-kubernetes-minikube.md
git commit -m "docs: add phase 13 Kubernetes design and plan"
```

- [ ] **Step 5: Initialiser les fichiers de suivi de session**

Écrire dans `task_plan.md` la phase courante (phase 13, worktree, branche, tâches 0 à 9), vider `progress.md` et `findings.md` des traces de la phase 12 en gardant leur structure. Ces trois fichiers sont ignorés par Git : aucun commit.

---

### Task 1: Installation de Minikube et démarrage du cluster

**Files:**
- Modify: `findings.md` (versions réelles relevées ; fichier ignoré par Git)

**Interfaces:**
- Consumes: le worktree de la tâche 0.
- Produces: un cluster Minikube nommé `devops-store` démarré avec le driver Docker, et le contexte kubectl actif du même nom. Les tâches 2 à 8 supposent ce cluster disponible.

- [ ] **Step 1: Installer Minikube**

```powershell
winget install --id Kubernetes.minikube --exact --accept-source-agreements --accept-package-agreements
```

Attendu : `Successfully installed`. Si `winget` échoue, télécharger `minikube-windows-amd64.exe` depuis la page des releases officielles et le placer dans un répertoire du `PATH`. Ouvrir un nouveau terminal pour que le `PATH` soit rechargé.

- [ ] **Step 2: Relever les versions réelles**

```powershell
minikube version
kubectl version --client
docker info --format '{{.ServerVersion}}'
```

Attendu : une version de minikube affichée. Noter la version exacte de minikube et la version Kubernetes par défaut dans `findings.md` : elles seront inscrites dans la documentation et le socle de versions à la tâche 9. Ne pas inventer les valeurs `1.38.1` / `1.35.6` du plan d'origine si l'installation en fournit d'autres.

- [ ] **Step 3: Démarrer le cluster**

```powershell
minikube start --profile devops-store --driver=docker --cpus=4 --memory=6144
```

Attendu : `Done! kubectl is now configured to use "devops-store" cluster`. Si la mémoire demandée dépasse celle allouée à Docker Desktop, réduire `--memory` à `4096` et le noter dans `findings.md`.

- [ ] **Step 4: Vérifier le nœud et le contexte**

```powershell
kubectl config current-context
kubectl get nodes -o wide
```

Attendu : contexte `devops-store`, un nœud `Ready` avec sa version de kubelet.

- [ ] **Step 5: Vérifier la classe de stockage par défaut**

```powershell
kubectl get storageclass
```

Attendu : `standard (default)` fourni par le provisionneur hostpath. Les PVC des tâches 2 et 3 n'indiquent donc aucun `storageClassName`.

---

### Task 2: Namespace et PostgreSQL

**Files:**
- Create: `infrastructure/kubernetes/namespace.yaml`
- Create: `infrastructure/kubernetes/postgres/configmap.yaml`
- Create: `infrastructure/kubernetes/postgres/secret.example.yaml`
- Create: `infrastructure/kubernetes/postgres/statefulset.yaml`
- Create: `infrastructure/kubernetes/postgres/service.yaml`

**Interfaces:**
- Consumes: le cluster de la tâche 1.
- Produces: le namespace `devops-store` ; le Service ClusterIP `postgres` sur le port `5432` ; la ConfigMap `postgres-config` avec les clés `POSTGRES_DB` et `POSTGRES_USER` ; le Secret `postgres-credentials` avec la clé `POSTGRES_PASSWORD`. Les tâches 4 et 8 consomment `postgres:5432`.

- [ ] **Step 1: Écrire le namespace**

`infrastructure/kubernetes/namespace.yaml` :

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: devops-store
  labels:
    app.kubernetes.io/part-of: devops-store
```

- [ ] **Step 2: Écrire la ConfigMap PostgreSQL**

`infrastructure/kubernetes/postgres/configmap.yaml` :

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: devops-store
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/part-of: devops-store
data:
  POSTGRES_DB: devops_store
  POSTGRES_USER: devops_store
```

- [ ] **Step 3: Écrire l'exemple de Secret**

`infrastructure/kubernetes/postgres/secret.example.yaml` :

```yaml
# Exemple sans valeur reelle. Ne jamais committer de mot de passe.
# Creer le Secret reel avec :
#   kubectl create secret generic postgres-credentials -n devops-store `
#     --from-literal=POSTGRES_PASSWORD=<valeur locale hors Git>
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: devops-store
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/part-of: devops-store
type: Opaque
stringData:
  POSTGRES_PASSWORD: ""
```

- [ ] **Step 4: Écrire le StatefulSet**

`infrastructure/kubernetes/postgres/statefulset.yaml` :

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: devops-store
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/part-of: devops-store
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgres
        app.kubernetes.io/part-of: devops-store
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: postgres
          image: postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
          ports:
            - name: postgres
              containerPort: 5432
          envFrom:
            - configMapRef:
                name: postgres-config
            - secretRef:
                name: postgres-credentials
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql
            - name: run
              mountPath: /var/run/postgresql
            - name: tmp
              mountPath: /tmp
          readinessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 6
          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 6
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            capabilities:
              drop:
                - ALL
      volumes:
        - name: run
          emptyDir: {}
        - name: tmp
          emptyDir: {}
      terminationGracePeriodSeconds: 30
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 2Gi
```

- [ ] **Step 5: Écrire le Service**

`infrastructure/kubernetes/postgres/service.yaml` :

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: devops-store
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/part-of: devops-store
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: postgres
  ports:
    - name: postgres
      port: 5432
      targetPort: postgres
```

- [ ] **Step 6: Valider les manifests avant application**

```powershell
kubectl apply --dry-run=client -R -f infrastructure/kubernetes
```

Attendu : une ligne `... created (dry run)` par objet, aucune erreur de schéma.

- [ ] **Step 7: Créer le namespace et le Secret réel**

```powershell
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl create secret generic postgres-credentials -n devops-store --from-literal=POSTGRES_PASSWORD=$env:DB_PASSWORD
```

`$env:DB_PASSWORD` doit être défini dans la session depuis le `.env` local. Si la variable est vide, la commande crée un mot de passe vide : vérifier d'abord avec `if (-not $env:DB_PASSWORD) { "DB_PASSWORD manquant" }`.

- [ ] **Step 8: Déployer PostgreSQL et vérifier**

```powershell
kubectl apply -R -f infrastructure/kubernetes/postgres
kubectl rollout status statefulset/postgres -n devops-store --timeout=180s
kubectl get pods,pvc -n devops-store
```

Attendu : `partitioned roll out complete` ou `statefulset rolling update complete`, pod `postgres-0` en `1/1 Running`, PVC `data-postgres-0` en `Bound`.

- [ ] **Step 9: Vérifier la base réellement accessible**

```powershell
kubectl exec -n devops-store postgres-0 -- psql -U devops_store -d devops_store -c "select 1;"
```

Attendu : une ligne de résultat `1`. En cas de `Permission denied` sur le volume, relever la sortie de `kubectl logs postgres-0 -n devops-store` dans `findings.md` avant toute correction.

- [ ] **Step 10: Commit**

```powershell
git add infrastructure/kubernetes/namespace.yaml infrastructure/kubernetes/postgres
git commit -m "feat(k8s): add namespace and PostgreSQL manifests"
```

---

### Task 3: AIStor

**Files:**
- Create: `infrastructure/kubernetes/object-storage/configmap.yaml`
- Create: `infrastructure/kubernetes/object-storage/secret.example.yaml`
- Create: `infrastructure/kubernetes/object-storage/statefulset.yaml`
- Create: `infrastructure/kubernetes/object-storage/service.yaml`

**Interfaces:**
- Consumes: le namespace `devops-store` de la tâche 2.
- Produces: le Service `object-storage` (ClusterIP interne + NodePorts `30900` pour l'API `9000` et `30901` pour la console `9001`) ; le Secret `object-storage-credentials` avec la clé `MINIO_ROOT_PASSWORD` ; le Secret `object-storage-license` avec la clé `minio.license`. La tâche 4 consomme `http://object-storage:9000`.

- [ ] **Step 1: Écrire la ConfigMap**

`infrastructure/kubernetes/object-storage/configmap.yaml` :

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: object-storage-config
  namespace: devops-store
  labels:
    app.kubernetes.io/name: object-storage
    app.kubernetes.io/part-of: devops-store
data:
  MINIO_ROOT_USER: devops_store
  HOME: /tmp
```

- [ ] **Step 2: Écrire l'exemple de Secret**

`infrastructure/kubernetes/object-storage/secret.example.yaml` :

```yaml
# Exemple sans valeur reelle. Ne jamais committer de secret ni de licence.
# Creer les deux Secrets reels avec :
#   kubectl create secret generic object-storage-credentials -n devops-store `
#     --from-literal=MINIO_ROOT_PASSWORD=<meme valeur que MINIO_SECRET_KEY>
#   kubectl create secret generic object-storage-license -n devops-store `
#     --from-file=minio.license=$env:MINIO_LICENSE_FILE
apiVersion: v1
kind: Secret
metadata:
  name: object-storage-credentials
  namespace: devops-store
  labels:
    app.kubernetes.io/name: object-storage
    app.kubernetes.io/part-of: devops-store
type: Opaque
stringData:
  MINIO_ROOT_PASSWORD: ""
```

- [ ] **Step 3: Écrire le StatefulSet**

`infrastructure/kubernetes/object-storage/statefulset.yaml` :

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: object-storage
  namespace: devops-store
  labels:
    app.kubernetes.io/name: object-storage
    app.kubernetes.io/part-of: devops-store
spec:
  serviceName: object-storage
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: object-storage
  template:
    metadata:
      labels:
        app.kubernetes.io/name: object-storage
        app.kubernetes.io/part-of: devops-store
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: object-storage
          image: quay.io/minio/aistor/minio:RELEASE.2026-04-14T21-32-45Z@sha256:3fe2c9acc9bf79ce982fa61d4befb97556a34e44e278395152ed54de471bb95d
          args:
            - minio
            - server
            - /mnt/data
            - --console-address
            - :9001
            - --license
            - /run/secrets/minio.license
          ports:
            - name: api
              containerPort: 9000
            - name: console
              containerPort: 9001
          envFrom:
            - configMapRef:
                name: object-storage-config
          env:
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: object-storage-credentials
                  key: MINIO_ROOT_PASSWORD
          volumeMounts:
            - name: data
              mountPath: /mnt/data
            - name: license
              mountPath: /run/secrets
              readOnly: true
            - name: tmp
              mountPath: /tmp
          startupProbe:
            httpGet:
              path: /minio/health/live
              port: api
            periodSeconds: 5
            failureThreshold: 24
          livenessProbe:
            httpGet:
              path: /minio/health/live
              port: api
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /minio/health/ready
              port: api
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 3
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
      volumes:
        - name: license
          secret:
            secretName: object-storage-license
            defaultMode: 0440
        - name: tmp
          emptyDir:
            sizeLimit: 64Mi
      terminationGracePeriodSeconds: 30
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 2Gi
```

- [ ] **Step 4: Écrire le Service**

`infrastructure/kubernetes/object-storage/service.yaml` :

```yaml
apiVersion: v1
kind: Service
metadata:
  name: object-storage
  namespace: devops-store
  labels:
    app.kubernetes.io/name: object-storage
    app.kubernetes.io/part-of: devops-store
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: object-storage
  ports:
    - name: api
      port: 9000
      targetPort: api
      nodePort: 30900
    - name: console
      port: 9001
      targetPort: console
      nodePort: 30901
```

- [ ] **Step 5: Créer les deux Secrets réels**

```powershell
kubectl create secret generic object-storage-credentials -n devops-store --from-literal=MINIO_ROOT_PASSWORD=$env:MINIO_SECRET_KEY
kubectl create secret generic object-storage-license -n devops-store --from-file=minio.license=$env:MINIO_LICENSE_FILE
```

Vérifier d'abord que les deux variables sont définies et que le fichier de licence existe : `Test-Path $env:MINIO_LICENSE_FILE` doit renvoyer `True`.

- [ ] **Step 6: Valider puis déployer**

```powershell
kubectl apply --dry-run=client -R -f infrastructure/kubernetes/object-storage
kubectl apply -R -f infrastructure/kubernetes/object-storage
kubectl rollout status statefulset/object-storage -n devops-store --timeout=180s
```

Attendu : pod `object-storage-0` en `1/1 Running`.

- [ ] **Step 7: Vérifier la santé réelle**

```powershell
kubectl get pods -n devops-store -o wide
kubectl logs object-storage-0 -n devops-store --tail=20
```

Attendu : logs de démarrage AIStor sans erreur de licence. Si le pod reste `0/1`, relever la sortie de `kubectl describe pod object-storage-0 -n devops-store` dans `findings.md`. Ne jamais afficher le contenu du fichier de licence.

- [ ] **Step 8: Commit**

```powershell
git add infrastructure/kubernetes/object-storage
git commit -m "feat(k8s): add AIStor object storage manifests"
```

---

### Task 4: Backend

**Files:**
- Create: `infrastructure/kubernetes/backend/configmap.yaml`
- Create: `infrastructure/kubernetes/backend/secret.example.yaml`
- Create: `infrastructure/kubernetes/backend/deployment.yaml`
- Create: `infrastructure/kubernetes/backend/service.yaml`

**Interfaces:**
- Consumes: `postgres:5432` (tâche 2) et `object-storage:9000` (tâche 3).
- Produces: le Service ClusterIP `backend` exposant le port `8080` nommé `http` et le port `8081` nommé `management` ; le Secret `backend-credentials` avec les clés `DB_PASSWORD`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD` et `MINIO_SECRET_KEY`. La tâche 5 consomme `http://backend:8080` par le proxy Nginx.

- [ ] **Step 1: Résoudre le digest de l'image de l'initContainer**

```powershell
docker pull busybox:1.37.0
docker inspect --format '{{index .RepoDigests 0}}' busybox:1.37.0
```

Attendu : une ligne `busybox@sha256:...`. Reporter cette valeur exacte à l'étape 3 à la place de `<BUSYBOX_DIGEST>` et la noter dans `findings.md`.

- [ ] **Step 2: Écrire la ConfigMap**

`infrastructure/kubernetes/backend/configmap.yaml` :

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: devops-store
  labels:
    app.kubernetes.io/name: backend
    app.kubernetes.io/part-of: devops-store
data:
  DB_URL: jdbc:postgresql://postgres:5432/devops_store
  DB_USERNAME: devops_store
  MANAGEMENT_SERVER_PORT: "8081"
  CORS_ALLOWED_ORIGIN: http://localhost:8088
  JWT_ISSUER: https://devops-store.local
  BOOTSTRAP_ADMIN_EMAIL: admin@devops-store.local
  BOOTSTRAP_ADMIN_NAME: DevOps Store Admin
  AUTH_COOKIE_SECURE: "false"
  MINIO_ENDPOINT: http://object-storage:9000
  MINIO_PUBLIC_ENDPOINT: http://localhost:9000
  MINIO_ACCESS_KEY: devops_store
  MINIO_BUCKET: devops-store-products
  MINIO_REGION: us-east-1
  MINIO_INITIALIZE_BUCKET: "true"
  MINIO_ORPHAN_MIN_AGE: 24h
  MINIO_ORPHAN_RECONCILIATION_INTERVAL: 1h
```

- [ ] **Step 3: Écrire l'exemple de Secret**

`infrastructure/kubernetes/backend/secret.example.yaml` :

```yaml
# Exemple sans valeur reelle. Ne jamais committer de secret.
# Creer le Secret reel avec :
#   kubectl create secret generic backend-credentials -n devops-store `
#     --from-literal=DB_PASSWORD=<meme valeur que POSTGRES_PASSWORD> `
#     --from-literal=JWT_SECRET=<au moins 32 octets> `
#     --from-literal=BOOTSTRAP_ADMIN_PASSWORD=<mot de passe local> `
#     --from-literal=MINIO_SECRET_KEY=<meme valeur que MINIO_ROOT_PASSWORD>
apiVersion: v1
kind: Secret
metadata:
  name: backend-credentials
  namespace: devops-store
  labels:
    app.kubernetes.io/name: backend
    app.kubernetes.io/part-of: devops-store
type: Opaque
stringData:
  DB_PASSWORD: ""
  JWT_SECRET: ""
  BOOTSTRAP_ADMIN_PASSWORD: ""
  MINIO_SECRET_KEY: ""
```

- [ ] **Step 4: Écrire le Deployment**

`infrastructure/kubernetes/backend/deployment.yaml`, en remplaçant `<BUSYBOX_DIGEST>` par la valeur relevée à l'étape 1 :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: devops-store
  labels:
    app.kubernetes.io/name: backend
    app.kubernetes.io/part-of: devops-store
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: backend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: backend
        app.kubernetes.io/part-of: devops-store
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      initContainers:
        - name: wait-for-dependencies
          image: busybox:1.37.0@sha256:<BUSYBOX_DIGEST>
          command:
            - /bin/sh
            - -c
            - |
              until nc -z postgres 5432; do
                echo "waiting for postgres:5432"
                sleep 2
              done
              until nc -z object-storage 9000; do
                echo "waiting for object-storage:9000"
                sleep 2
              done
              echo "dependencies are reachable"
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 100m
              memory: 32Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
      containers:
        - name: backend
          image: devops-store-backend:local
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8080
            - name: management
              containerPort: 8081
          envFrom:
            - configMapRef:
                name: backend-config
            - secretRef:
                name: backend-credentials
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          startupProbe:
            httpGet:
              path: /actuator/health/liveness
              port: management
            periodSeconds: 5
            failureThreshold: 30
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: management
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: management
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 3
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 768Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 128Mi
      terminationGracePeriodSeconds: 30
```

- [ ] **Step 5: Écrire le Service**

`infrastructure/kubernetes/backend/service.yaml` :

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: devops-store
  labels:
    app.kubernetes.io/name: backend
    app.kubernetes.io/part-of: devops-store
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: backend
  ports:
    - name: http
      port: 8080
      targetPort: http
    - name: management
      port: 8081
      targetPort: management
```

- [ ] **Step 6: Construire et charger les images**

```powershell
docker compose build backend frontend
minikube image load devops-store-backend:local --profile devops-store
minikube image load devops-store-frontend:local --profile devops-store
minikube image ls --profile devops-store | Select-String devops-store
```

Attendu : les deux images listées dans le cluster. `docker compose build` exige les variables obligatoires du `.env` : exécuter depuis un shell où elles sont chargées.

- [ ] **Step 7: Créer le Secret réel du backend**

```powershell
kubectl create secret generic backend-credentials -n devops-store --from-literal=DB_PASSWORD=$env:DB_PASSWORD --from-literal=JWT_SECRET=$env:JWT_SECRET --from-literal=BOOTSTRAP_ADMIN_PASSWORD=$env:BOOTSTRAP_ADMIN_PASSWORD --from-literal=MINIO_SECRET_KEY=$env:MINIO_SECRET_KEY
```

- [ ] **Step 8: Déployer et vérifier le rollout**

```powershell
kubectl apply --dry-run=client -R -f infrastructure/kubernetes/backend
kubectl apply -R -f infrastructure/kubernetes/backend
kubectl rollout status deployment/backend -n devops-store --timeout=240s
kubectl get pods -n devops-store
```

Attendu : pod backend `1/1 Running`, zéro redémarrage. Si le pod boucle, vérifier d'abord les logs de l'initContainer : `kubectl logs deploy/backend -n devops-store -c wait-for-dependencies`.

- [ ] **Step 9: Vérifier l'API et Actuator depuis le cluster**

```powershell
kubectl run curl-check -n devops-store --rm -i --restart=Never --image=curlimages/curl:8.11.1 -- curl -s -o /dev/null -w "%{http_code}" http://backend:8080/api/v1/products
kubectl exec -n devops-store deploy/backend -- wget -qO- http://localhost:8081/actuator/health/readiness
```

Attendu : code HTTP `200` sur l'API, et `{"status":"UP"}` sur la readiness.

- [ ] **Step 10: Vérifier que le bucket a bien été créé**

```powershell
kubectl logs deploy/backend -n devops-store | Select-String -Pattern "bucket|storage" | Select-Object -First 10
```

Attendu : aucune trace d'échec d'initialisation du bucket. En cas d'erreur, la relever dans `findings.md`.

- [ ] **Step 11: Commit**

```powershell
git add infrastructure/kubernetes/backend
git commit -m "feat(k8s): add backend manifests with dependency init container"
```

---

### Task 5: Frontend

**Files:**
- Create: `infrastructure/kubernetes/frontend/deployment.yaml`
- Create: `infrastructure/kubernetes/frontend/service.yaml`

**Interfaces:**
- Consumes: le Service `backend` de la tâche 4, atteint par `http://backend:8080` codé dans `frontend/nginx.conf`.
- Produces: le Service NodePort `frontend` exposant le port `8080` sur le NodePort `30080`. La tâche 6 y branche `kubectl port-forward` sur `127.0.0.1:8088`.

- [ ] **Step 1: Écrire le Deployment**

`infrastructure/kubernetes/frontend/deployment.yaml` :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: devops-store
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: devops-store
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: frontend
        app.kubernetes.io/part-of: devops-store
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        runAsGroup: 101
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: frontend
          image: devops-store-frontend:local
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8080
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          startupProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 3
            failureThreshold: 20
          livenessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 32Mi
      terminationGracePeriodSeconds: 15
```

- [ ] **Step 2: Écrire le Service**

`infrastructure/kubernetes/frontend/service.yaml` :

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: devops-store
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: devops-store
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: frontend
  ports:
    - name: http
      port: 8080
      targetPort: http
      nodePort: 30080
```

- [ ] **Step 3: Déployer et vérifier le rollout**

```powershell
kubectl apply --dry-run=client -R -f infrastructure/kubernetes/frontend
kubectl apply -R -f infrastructure/kubernetes/frontend
kubectl rollout status deployment/frontend -n devops-store --timeout=120s
```

Attendu : `deployment "frontend" successfully rolled out`.

- [ ] **Step 4: Vérifier la page et le proxy API depuis le cluster**

```powershell
kubectl run curl-front -n devops-store --rm -i --restart=Never --image=curlimages/curl:8.11.1 -- sh -c "curl -s -o /dev/null -w 'page=%{http_code} ' http://frontend:8080/ ; curl -s -o /dev/null -w 'api=%{http_code}\n' http://frontend:8080/api/v1/products"
```

Attendu : `page=200 api=200`. Un `api=502` signifie que le Service `backend` n'est pas résolu : vérifier son nom exact.

- [ ] **Step 5: Commit**

```powershell
git add infrastructure/kubernetes/frontend
git commit -m "feat(k8s): add frontend manifests"
```

---

### Task 6: Cibles Make

**Files:**
- Modify: `Makefile` (variables en tête de fichier, liste `.PHONY`, bloc d'aide `help`, nouvelles cibles en fin de fichier)

**Interfaces:**
- Consumes: tous les manifests des tâches 2 à 5.
- Produces: les cibles `k8s-start`, `k8s-config`, `k8s-images`, `k8s-secrets`, `k8s-deploy`, `k8s-rollout`, `k8s-status`, `k8s-forward`, `k8s-logs`, `k8s-delete`, `k8s-reset`, `k8s-stop`. La tâche 9 les documente.

- [ ] **Step 1: Ajouter les variables**

Après la ligne `ALLOY_IMAGE ?= ...` du `Makefile` :

```makefile
KUBECTL ?= kubectl
MINIKUBE ?= minikube
K8S_PROFILE ?= devops-store
K8S_NAMESPACE ?= devops-store
K8S_MANIFESTS ?= infrastructure/kubernetes
K8S_FRONTEND_PORT ?= 8088
K8S_STORAGE_PORT ?= 9000
```

- [ ] **Step 2: Déclarer les cibles dans `.PHONY`**

Ajouter une ligne à la déclaration `.PHONY` existante :

```makefile
	k8s-start k8s-config k8s-images k8s-secrets k8s-deploy k8s-rollout k8s-status \
	k8s-forward k8s-logs k8s-delete k8s-reset k8s-stop
```

- [ ] **Step 3: Compléter l'aide**

Ajouter dans la cible `help`, après les lignes d'observabilité :

```makefile
	$(info   k8s-start         Start the local Minikube cluster)
	$(info   k8s-config        Validate the Kubernetes manifests)
	$(info   k8s-images        Build and load the application images into Minikube)
	$(info   k8s-secrets       Create the cluster secrets from the current environment)
	$(info   k8s-deploy        Apply every Kubernetes manifest)
	$(info   k8s-rollout       Wait until every workload is ready)
	$(info   k8s-status        Show pods, services, workloads and volumes)
	$(info   k8s-forward       Forward the frontend and object storage ports)
	$(info   k8s-logs          Follow the backend logs)
	$(info   k8s-delete        Delete the workloads and keep the volumes)
	$(info   k8s-reset         Delete the namespace and its volumes)
	$(info   k8s-stop          Stop the cluster without deleting it)
```

- [ ] **Step 4: Écrire les cibles**

À la fin du `Makefile` :

```makefile
k8s-start: ## Start the local Minikube cluster
	$(MINIKUBE) start --profile $(K8S_PROFILE) --driver=docker --cpus=4 --memory=6144

k8s-config: ## Validate the Kubernetes manifests
	$(KUBECTL) apply --dry-run=client -R -f $(K8S_MANIFESTS)
	$(KUBECTL) apply --dry-run=server -R -f $(K8S_MANIFESTS)

k8s-images: ## Build and load the application images into Minikube
	$(MAKE) build
	$(MINIKUBE) image load devops-store-backend:local --profile $(K8S_PROFILE)
	$(MINIKUBE) image load devops-store-frontend:local --profile $(K8S_PROFILE)

k8s-secrets: ## Create the cluster secrets from the current environment
	@test -n "$$DB_PASSWORD" || { echo "DB_PASSWORD is required"; exit 1; }
	@test -n "$$JWT_SECRET" || { echo "JWT_SECRET is required"; exit 1; }
	@test -n "$$BOOTSTRAP_ADMIN_PASSWORD" || { echo "BOOTSTRAP_ADMIN_PASSWORD is required"; exit 1; }
	@test -n "$$MINIO_SECRET_KEY" || { echo "MINIO_SECRET_KEY is required"; exit 1; }
	@test -n "$$MINIO_LICENSE_FILE" || { echo "MINIO_LICENSE_FILE is required"; exit 1; }
	$(KUBECTL) apply -f $(K8S_MANIFESTS)/namespace.yaml
	$(KUBECTL) create secret generic postgres-credentials -n $(K8S_NAMESPACE) \
		--from-literal=POSTGRES_PASSWORD="$$DB_PASSWORD" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic object-storage-credentials -n $(K8S_NAMESPACE) \
		--from-literal=MINIO_ROOT_PASSWORD="$$MINIO_SECRET_KEY" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic object-storage-license -n $(K8S_NAMESPACE) \
		--from-file=minio.license="$$MINIO_LICENSE_FILE" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic backend-credentials -n $(K8S_NAMESPACE) \
		--from-literal=DB_PASSWORD="$$DB_PASSWORD" \
		--from-literal=JWT_SECRET="$$JWT_SECRET" \
		--from-literal=BOOTSTRAP_ADMIN_PASSWORD="$$BOOTSTRAP_ADMIN_PASSWORD" \
		--from-literal=MINIO_SECRET_KEY="$$MINIO_SECRET_KEY" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -

k8s-deploy: ## Apply every Kubernetes manifest
	$(KUBECTL) apply -R -f $(K8S_MANIFESTS)

k8s-rollout: ## Wait until every workload is ready
	$(KUBECTL) rollout status statefulset/postgres -n $(K8S_NAMESPACE) --timeout=180s
	$(KUBECTL) rollout status statefulset/object-storage -n $(K8S_NAMESPACE) --timeout=180s
	$(KUBECTL) rollout status deployment/backend -n $(K8S_NAMESPACE) --timeout=240s
	$(KUBECTL) rollout status deployment/frontend -n $(K8S_NAMESPACE) --timeout=120s

k8s-status: ## Show pods, services, workloads and volumes
	$(KUBECTL) get pods,svc,deployments,statefulsets,pvc -n $(K8S_NAMESPACE)

k8s-forward: ## Forward the frontend and object storage ports
	$(KUBECTL) port-forward -n $(K8S_NAMESPACE) service/object-storage $(K8S_STORAGE_PORT):9000 & \
	$(KUBECTL) port-forward -n $(K8S_NAMESPACE) service/frontend $(K8S_FRONTEND_PORT):8080

k8s-logs: ## Follow the backend logs
	$(KUBECTL) logs -n $(K8S_NAMESPACE) deployment/backend --follow --tail=200

k8s-delete: ## Delete the workloads and keep the volumes
	$(KUBECTL) delete -R -f $(K8S_MANIFESTS) --ignore-not-found

k8s-reset: ## Delete the namespace and its volumes
	$(KUBECTL) delete namespace $(K8S_NAMESPACE) --ignore-not-found

k8s-stop: ## Stop the cluster without deleting it
	$(MINIKUBE) stop --profile $(K8S_PROFILE)
```

`k8s-delete` supprime aussi le namespace déclaré dans `namespace.yaml`, donc les PVC partent avec lui : corriger en excluant le namespace du `delete` si la vérification de l'étape 6 le montre. La cible doit finir par conserver les PVC.

- [ ] **Step 5: Vérifier l'aide et la syntaxe**

```powershell
make help
make k8s-config
```

Attendu : les douze nouvelles lignes d'aide, puis les deux validations `--dry-run=client` et `--dry-run=server` sans erreur. La validation serveur exige le cluster démarré. Si `make` est absent du `PATH`, exécuter les commandes des cibles à la main et le noter dans `findings.md`.

- [ ] **Step 6: Vérifier que `k8s-delete` préserve les PVC**

```powershell
make k8s-delete
kubectl get pvc -n devops-store
make k8s-deploy
make k8s-rollout
```

Attendu : les deux PVC `data-postgres-0` et `data-object-storage-0` restent `Bound` après `k8s-delete`, et les workloads remontent. Si le namespace a été supprimé, retirer `namespace.yaml` du périmètre de `k8s-delete` en ciblant les quatre sous-dossiers explicitement, puis rejouer cette étape.

- [ ] **Step 7: Commit**

```powershell
git add Makefile
git commit -m "feat(k8s): add Minikube lifecycle make targets"
```

---

### Task 7: Couverture Trivy et validations statiques

**Files:**
- Modify: `Makefile` (cible `trivy-config` si elle n'inclut pas déjà `infrastructure/kubernetes`)
- Modify: `findings.md` (résultats de scan ; ignoré par Git)

**Interfaces:**
- Consumes: les manifests des tâches 2 à 5.
- Produces: la garantie que le scan de configuration couvre `infrastructure/kubernetes` sans misconfiguration HIGH ou CRITICAL, sur laquelle la CI de la tâche 9 s'appuie.

- [ ] **Step 1: Lire la cible existante**

```powershell
Select-String -Path Makefile -Pattern "trivy-config" -Context 0,10
```

Relever si le scan porte sur tout le dépôt ou sur des chemins explicites.

- [ ] **Step 2: Lancer le scan de configuration**

```powershell
make trivy-config
```

Si `make` est absent, exécuter la commande `docker run` équivalente relevée à l'étape 1, avec `MSYS_NO_PATHCONV=1` en préfixe si le shell est Git Bash.

- [ ] **Step 3: Vérifier la couverture réelle des manifests**

Dans la sortie, confirmer la présence d'au moins un fichier `infrastructure/kubernetes/...`. Si aucun manifest n'apparaît, ajouter le chemin au scan dans la cible `trivy-config`, puis relancer.

- [ ] **Step 4: Traiter les misconfigurations**

Attendu : zéro finding HIGH ou CRITICAL. Pour chaque finding, soit corriger le manifest, soit — si le contrôle est inapplicable au laboratoire — documenter la raison dans `findings.md` et ne rien ignorer silencieusement. Les contrôles attendus comme satisfaits sont : conteneur non-root, privilèges non escaladables, capacités supprimées, système de fichiers racine en lecture seule, requests et limits définies.

- [ ] **Step 5: Revalider la totalité des manifests**

```powershell
git diff --check
kubectl apply --dry-run=client -R -f infrastructure/kubernetes
kubectl apply --dry-run=server -R -f infrastructure/kubernetes
```

Attendu : aucune erreur d'espace en fin de ligne, puis `... (dry run)` pour chaque objet, y compris côté serveur.

- [ ] **Step 6: Commit si le Makefile a changé**

```powershell
git add Makefile
git commit -m "chore(k8s): cover the Kubernetes manifests with the Trivy config scan"
```

Si aucun fichier n'a changé, sauter le commit et le noter dans `progress.md`.

---

### Task 8: Acceptation dynamique

**Files:**
- Modify: `progress.md` (preuves d'exécution ; ignoré par Git)
- Modify: `findings.md` (pannes rencontrées ; ignoré par Git)

**Interfaces:**
- Consumes: le cluster complet déployé après les tâches 2 à 6.
- Produces: les preuves réelles des quatre critères d'acceptation du plan de phase, réutilisées par la documentation de la tâche 9.

- [ ] **Step 1: État initial**

```powershell
make k8s-status
kubectl get pods -n devops-store -o "custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount"
```

Attendu : quatre pods Ready, `restartCount` à `0`. Copier la sortie dans `progress.md`.

- [ ] **Step 2: Ouvrir les redirections de ports**

Arrêter d'abord la stack Compose si elle tourne (`docker compose down`), puis, dans deux terminaux distincts :

```powershell
kubectl port-forward -n devops-store service/frontend 8088:8080
kubectl port-forward -n devops-store service/object-storage 9000:9000
```

Attendu : `Forwarding from 127.0.0.1:8088 -> 8080` et l'équivalent sur 9000.

- [ ] **Step 3: Parcours applicatif réel**

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8088/api/v1/auth/login -Method Post -ContentType application/json -Body (@{ email = $env:BOOTSTRAP_ADMIN_EMAIL; password = $env:BOOTSTRAP_ADMIN_PASSWORD } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$created = Invoke-RestMethod -Uri http://localhost:8088/api/v1/products -Method Post -Headers $headers -ContentType application/json -Body '{"name":"Phase 13 probe","description":"Kubernetes acceptance","price":19.99,"stock":3,"category":"HARDWARE"}'
$created.id
```

Attendu : un identifiant entier. Si le contrat du corps JSON diffère, le relever depuis `backend/src/main/java/com/molo/devopsstore/product/api/dto/` et adapter, sans modifier le code applicatif. Noter l'identifiant : il sert à l'étape 5.

- [ ] **Step 4: Critère 1 — stabilité après suppression de pods**

```powershell
kubectl delete pod -n devops-store -l app.kubernetes.io/name=backend
kubectl rollout status deployment/backend -n devops-store --timeout=240s
kubectl delete pod -n devops-store -l app.kubernetes.io/name=frontend
kubectl rollout status deployment/frontend -n devops-store --timeout=120s
make k8s-status
```

Attendu : les deux workloads reviennent Ready sans intervention.

- [ ] **Step 5: Critère 2 — persistance PostgreSQL**

```powershell
kubectl delete pod -n devops-store postgres-0
kubectl rollout status statefulset/postgres -n devops-store --timeout=180s
kubectl exec -n devops-store postgres-0 -- psql -U devops_store -d devops_store -c "select count(*) from flyway_schema_history;"
kubectl exec -n devops-store postgres-0 -- psql -U devops_store -d devops_store -c "select id, name from products where name = 'Phase 13 probe';"
```

Attendu : l'historique Flyway est non vide et le produit créé à l'étape 3 est toujours présent après recréation du pod.

- [ ] **Step 6: Critère 4 — niveau des probes pendant une panne base**

```powershell
kubectl get pod -n devops-store -l app.kubernetes.io/name=backend -o "jsonpath={.items[0].status.containerStatuses[0].restartCount}"
kubectl scale statefulset/postgres -n devops-store --replicas=0
kubectl get pods -n devops-store
```

Attendre au moins 90 secondes, soit plus que `periodSeconds` × `failureThreshold` de la liveness, puis :

```powershell
kubectl get pod -n devops-store -l app.kubernetes.io/name=backend -o "jsonpath={.items[0].status.containerStatuses[0].restartCount}"
kubectl get pod -n devops-store -l app.kubernetes.io/name=backend -o "jsonpath={.items[0].status.conditions[?(@.type=='Ready')].status}"
```

Attendu : `restartCount` identique à la valeur initiale, pod toujours `Ready`. C'est la preuve que PostgreSQL n'entre ni dans la liveness ni dans la readiness.

- [ ] **Step 7: Retour au nominal**

```powershell
kubectl scale statefulset/postgres -n devops-store --replicas=1
kubectl rollout status statefulset/postgres -n devops-store --timeout=180s
Invoke-RestMethod -Uri http://localhost:8088/api/v1/products -Method Get | Select-Object -First 1
```

Attendu : l'API répond de nouveau avec des données.

- [ ] **Step 8: Critère 3 — aucun secret dans le dépôt**

```powershell
Select-String -Path infrastructure/kubernetes/*/*.yaml -Pattern "$env:JWT_SECRET" -SimpleMatch
Select-String -Path infrastructure/kubernetes/*/*.yaml -Pattern "$env:DB_PASSWORD" -SimpleMatch
Select-String -Path infrastructure/kubernetes/*/*.yaml -Pattern "$env:MINIO_SECRET_KEY" -SimpleMatch
git grep -n "BEGIN" -- infrastructure/kubernetes
kubectl get secrets -n devops-store
```

Attendu : aucune correspondance dans les trois recherches, aucune licence dans les manifests, et quatre Secrets listés dans le cluster seulement.

- [ ] **Step 9: Nettoyer la donnée de test**

```powershell
Invoke-RestMethod -Uri "http://localhost:8088/api/v1/products/$($created.id)" -Method Delete -Headers $headers
```

Attendu : suppression acceptée. Consigner dans `progress.md` la sortie réelle de chaque étape 1 à 9.

- [ ] **Step 10: Vérifier `k8s-reset`**

```powershell
make k8s-reset
kubectl get all,pvc -n devops-store
```

Attendu : le namespace disparaît avec ses PVC. Redéployer ensuite pour laisser le cluster utilisable : `make k8s-secrets`, `make k8s-deploy`, `make k8s-rollout`.

---

### Task 9: Documentation, régression et livraison

**Files:**
- Create: `docs/infrastructure/kubernetes.md`
- Modify: `docs/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `README.md` si la section de démarrage doit mentionner la cible Kubernetes
- Modify: `docs/superpowers/plans/2026-09-17-kubernetes-minikube.md` (cases cochées)

**Interfaces:**
- Consumes: toutes les tâches précédentes et les preuves de la tâche 8.
- Produces: la phase documentée, la branche poussée et la Pull Request ouverte.

- [ ] **Step 1: Écrire `docs/infrastructure/kubernetes.md`**

Sections obligatoires : prérequis et versions réelles relevées à la tâche 1 ; installation de Minikube ; démarrage du cluster ; création des quatre Secrets, dont la licence AIStor ; chargement des images ; déploiement et attente du rollout ; accès par `make k8s-forward` sur `127.0.0.1:8088` et `127.0.0.1:9000`, avec l'avertissement sur le conflit du port 9000 avec la stack Compose et SonarQube ; mention de `minikube service frontend -n devops-store` comme accès alternatif et de sa limite d'origine CORS ; tableau des probes avec la justification de l'absence de PostgreSQL dans la liveness et la readiness ; `k8s-delete` contre `k8s-reset` et le sort des PVC ; pannes réellement rencontrées avec leur résolution.

- [ ] **Step 2: Référencer le document dans l'index**

Ajouter la ligne correspondante dans `docs/README.md`, à côté de `docs/infrastructure/terraform.md`.

- [ ] **Step 3: Mettre à jour `AGENTS.md`**

Ajouter Minikube et sa version réelle à la section « Implémentée » de la stack, retirer Kubernetes de la « Cible planifiée », ajouter les douze cibles `k8s-*` à la liste des cibles Make et pointer vers `docs/infrastructure/kubernetes.md`.

- [ ] **Step 4: Mettre à jour `docs/IMPLEMENTATION_PLAN.md`**

Cocher les neuf cases d'implémentation et les quatre critères d'acceptation de la phase 13 avec une preuve en ligne pour chacun, corriger les versions annoncées (minikube, Kubernetes, kubectl) par les valeurs réellement installées, et mettre à jour le socle de versions et l'état du dépôt.

- [ ] **Step 5: Régression**

```powershell
git diff --check
docker compose config --quiet
docker compose -f docker-compose.devops.yml --profile observability config --quiet
kubectl apply --dry-run=client -R -f infrastructure/kubernetes
make trivy-config
```

Attendu : toutes les commandes en succès. Consigner les sorties réelles dans `progress.md`.

- [ ] **Step 6: Revue du diff complet**

```powershell
git diff origin/main --stat
git diff origin/main
```

Vérifier : aucun secret, aucune licence, aucun fichier `target/` ou `node_modules/`, aucune modification du code applicatif, et des `secret.example.yaml` à valeurs vides.

- [ ] **Step 7: Cocher le plan et committer la documentation**

```powershell
git add docs/infrastructure/kubernetes.md docs/README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md README.md docs/superpowers/plans/2026-09-17-kubernetes-minikube.md
git commit -m "docs(k8s): document the Minikube deployment and record phase 13 evidence"
```

- [ ] **Step 8: Pousser et ouvrir la Pull Request**

Uniquement après autorisation explicite de l'utilisateur :

```powershell
git push -u origin feat/phase-13-kubernetes
gh pr create --title "feat(k8s): deploy the application on a local Minikube cluster" --body-file .worktrees-pr-body.md
```

Le corps de la PR, écrit dans un fichier temporaire hors du dépôt, contient : le périmètre (namespace, quatre workloads, Secrets hors Git, cibles Make, documentation), les quatre critères d'acceptation avec la preuve réelle relevée à la tâche 8, les validations statiques de l'étape 5, et les limites connues (accès par redirection de ports, conflit du port 9000, aucune observabilité dans le cluster).

- [ ] **Step 9: Attendre la CI**

```powershell
gh pr checks --watch
```

Attendu : tous les contrôles verts avant toute demande de fusion. La fusion et la suppression du worktree exigent une autorisation explicite supplémentaire.
