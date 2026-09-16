# Loki and Grafana Alloy Log Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la phase 12 en collectant les logs Docker du projet applicatif `devops-store` dans Loki via Grafana Alloy, sans accorder à Alloy le moindre accès direct au socket Docker, et en les rendant interrogeables dans le dashboard Grafana existant.

**Architecture:** Trois services sont ajoutés au profil Compose `observability` du projet outillage. `socket-proxy` est le seul conteneur à monter `/var/run/docker.sock` en lecture seule et n'autorise que les routes Docker de lecture de conteneurs et de journaux. `alloy` découvre les conteneurs via l'API HTTP du proxy, lit leurs journaux, promeut trois labels à faible cardinalité (`service_name`, `container`, `level`) et pousse la ligne JSON d'origine intacte vers `loki`, instance single-binary sur stockage fichier avec rétention sept jours. Grafana reçoit une datasource Loki d'UID `loki` et un panneau de logs dans le dashboard `devops-store-backend`.

**Tech Stack:** Docker Compose 5.1, Loki 3.7.7, Grafana Alloy 1.19.2, wollomatic/socket-proxy 1.13.1, Grafana 13.2.1, Prometheus 3.14.0, Spring Boot 4.1.1 (logs Logstash déjà en place), GNU Make et PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-09-16-loki-alloy-logs-design.md`

## Global Constraints

- Utiliser `grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500`.
- Utiliser `grafana/alloy:v1.19.2@sha256:b8ec653c44235fbe910879145dac3597d66b0aaecf60bcbbe82580767771a839`.
- Utiliser `wollomatic/socket-proxy:1.13.1@sha256:3935b709275e4ec35d6ed5a5c4a1f0d01ed31eec5e7234efc3357ecd47689002`.
- Ne jamais monter `/var/run/docker.sock` dans `alloy` ni dans un autre service que `socket-proxy`, et l'y monter uniquement en `:ro`.
- Restreindre la collecte aux conteneurs portant le label `com.docker.compose.project=devops-store`.
- Limiter les labels Loki à `service_name`, `container` et `level` ; `requestId`, `logger_name`, `thread_name` et `message` restent dans le contenu.
- Ne pas réécrire la ligne de log : le contenu poussé reste le JSON Logstash d'origine.
- Publier Loki et Alloy uniquement sur `127.0.0.1`.
- `auth_enabled: false` pour Loki, aucun secret ajouté, aucun secret versionné.
- Rétention Loki à `168h` avec compacteur actif ; volumes nommés `devops-store-loki-data` et `devops-store-alloy-data`.
- Ajouter les services au profil `observability` existant ; ne pas créer de nouveau profil Compose.
- Ne modifier aucun fichier du backend ni du frontend : les logs Logstash et le MDC `requestId` sont déjà en place.
- Ne pas toucher aux neuf panneaux Prometheus existants ni à l'UID de datasource `prometheus`.
- Reprendre le gabarit de durcissement de la phase 11 : `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `restart: unless-stopped`, `cpus`, `mem_limit`, `pids_limit`, utilisateur non root.
- Ne jamais annoncer un healthcheck, un test Docker ou une acceptance comme réussi sans la sortie réelle correspondante.
- Ne créer aucun commit, push ou PR sans autorisation explicite de l'utilisateur. Chaque étape de commit ci-dessous est conditionnelle à cette autorisation.
- Travailler dans le worktree `.worktrees/phase-12-loki-alloy` sur la branche `feat/phase-12-loki-alloy`.

## File Map

| Fichier | Responsabilité |
|---|---|
| `infrastructure/loki/loki-config.yml` | Configuration single-binary, schéma v13, rétention et compacteur |
| `infrastructure/alloy/config.alloy` | Découverte Docker filtrée, relabel, parsing JSON et écriture Loki |
| `docker-compose.devops.yml` | Services `socket-proxy`, `loki`, `alloy`, réseaux, volumes et durcissement |
| `infrastructure/grafana/provisioning/datasources/loki.yml` | Datasource Loki d'UID stable |
| `infrastructure/grafana/dashboards/backend-overview.json` | Panneau de logs ajouté au dashboard existant |
| `.env.example` | `LOKI_PORT`, `ALLOY_PORT` et `DOCKER_GID` sans secret |
| `Makefile` | Extension des six cibles `observability-*` aux trois nouveaux services |
| `docs/observability/loki.md` | Exploitation Loki, rétention, LogQL et diagnostic |
| `docs/observability/alloy.md` | Pipeline, périmètre de collecte, socket-proxy et labels |
| `docs/observability/grafana.md` | Datasource Loki et panneau de logs |
| `docs/README.md` | Index des guides |
| `README.md` | Services, ports et commandes réellement disponibles |
| `AGENTS.md` | Stack, variables d'environnement et commandes |
| `docs/IMPLEMENTATION_PLAN.md` | Cases et preuves réelles de la phase 12 |

---

### Task 0: Baseline, versions d'images et capacités réelles des images

Aucun fichier du dépôt n'est modifié dans cette tâche. Elle produit les faits dont dépendent les recettes des tâches suivantes : GID du groupe `docker`, sondes de santé réellement disponibles, sous-commandes de validation réellement présentes dans les images. La phase 11 a échoué trois fois sur une sonde Grafana supposée présente ; cette tâche existe pour que cela ne se reproduise pas.

**Files:**
- Aucun. Sortie consignée dans `progress.md` et `findings.md`.

**Interfaces:**
- Consumes: rien.
- Produces: `DOCKER_GID` (entier), `LOKI_HEALTHCHECK` (recette ou `aucune`), `ALLOY_HEALTHCHECK` (recette ou `aucune`), `LOKI_VERIFY_CMD`, `ALLOY_VALIDATE_CMD`.

- [ ] **Step 1: Vérifier l'état du worktree et l'arbre propre**

```powershell
Set-Location C:\Users\mouha\Documents\WorkspaceFullStack\molo-devops-lab\.worktrees\phase-12-loki-alloy
git status --short --branch
```

Attendu : branche `feat/phase-12-loki-alloy`, seuls la spécification et ce plan apparaissent comme non suivis. Si d'autres modifications apparaissent, s'arrêter et demander à l'utilisateur.

- [ ] **Step 2: Vérifier que Docker répond**

```powershell
docker info --format '{{.ServerVersion}}'
```

Attendu : un numéro de version. En cas d'erreur HTTP 500 sur le named pipe, WSL2 est figé : demander l'autorisation avant tout `wsl --shutdown --force`, ne jamais l'exécuter d'initiative.

- [ ] **Step 3: Télécharger les trois images par digest**

```powershell
docker pull grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500
docker pull grafana/alloy:v1.19.2@sha256:b8ec653c44235fbe910879145dac3597d66b0aaecf60bcbbe82580767771a839
docker pull wollomatic/socket-proxy:1.13.1@sha256:3935b709275e4ec35d6ed5a5c4a1f0d01ed31eec5e7234efc3357ecd47689002
```

Attendu : trois `Status: Downloaded` ou `Image is up to date`.

- [ ] **Step 4: Lire le GID réel du groupe `docker` dans la VM Docker Desktop**

```powershell
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro busybox:1.37.0 stat -c '%g' /var/run/docker.sock
```

Attendu : un entier, habituellement `999` sous Docker Desktop/WSL2. Consigner la valeur : elle devient la valeur par défaut de `DOCKER_GID` à la tâche 2. Ne pas supposer `999` sans cette sortie.

- [ ] **Step 5: Inventorier les binaires utilisables comme sonde dans l'image Loki**

```powershell
docker run --rm --entrypoint /bin/sh grafana/loki:3.7.7 -c "command -v wget curl nc; echo '---'; /usr/bin/loki --help 2>&1 | Select-String -Pattern 'verify-config'"
```

Si `/bin/sh` n'existe pas, la commande échoue immédiatement : c'est aussi un résultat. Reprendre alors avec `--entrypoint /busybox/sh` puis, en dernier recours, conclure `LOKI_HEALTHCHECK = aucune`.

Attendu : consigner quels binaires existent. `LOKI_HEALTHCHECK` vaut :
- `["CMD-SHELL", "wget --spider -q http://localhost:3100/ready"]` si `wget` existe ;
- `["CMD-SHELL", "curl --fail --silent http://localhost:3100/ready"]` si `curl` existe ;
- `aucune` sinon.

- [ ] **Step 6: Vérifier la sous-commande de validation de configuration Loki**

```powershell
docker run --rm --entrypoint /usr/bin/loki grafana/loki:3.7.7 -help 2>&1 | Select-String -Pattern 'verify-config'
```

Attendu : une ligne mentionnant `-verify-config`. `LOKI_VERIFY_CMD` vaut alors `-config.file=/etc/loki/loki-config.yml -verify-config`. Si l'option n'existe pas, consigner la sous-commande réellement disponible et l'utiliser partout où ce plan écrit `LOKI_VERIFY_CMD`.

- [ ] **Step 7: Inventorier les capacités de l'image Alloy**

```powershell
docker run --rm --entrypoint /bin/sh grafana/alloy:v1.19.2 -c "command -v wget curl; echo '---'; /bin/alloy --help 2>&1 | head -40"
```

Attendu : la liste des sous-commandes Alloy. Consigner si `fmt` et `validate` existent.
- `ALLOY_VALIDATE_CMD` vaut `validate /etc/alloy/config.alloy` si `validate` existe, sinon `fmt /etc/alloy/config.alloy` si seul `fmt` existe.
- `ALLOY_HEALTHCHECK` vaut `["CMD-SHELL", "wget --spider -q http://localhost:12345/-/ready"]` si `wget` existe, la variante `curl` si `curl` existe, `aucune` sinon.

- [ ] **Step 8: Consigner les faits**

Ajouter à `findings.md` une section « Phase 12 — capacités des images » contenant les cinq valeurs produites, avec la commande exacte et la sortie réelle qui les justifie. Ces valeurs sont les seules autorisées dans les tâches suivantes.

- [ ] **Step 9: Pas de commit**

Cette tâche ne modifie aucun fichier suivi. Ne rien committer.

---

### Task 1: Configuration et service Loki

**Files:**
- Create: `infrastructure/loki/loki-config.yml`
- Modify: `docker-compose.devops.yml` (section `services`, avant `networks:` ; section `volumes:`)
- Test: validation par `-verify-config` dans un conteneur jetable, puis démarrage réel isolé

**Interfaces:**
- Consumes: `LOKI_VERIFY_CMD` et `LOKI_HEALTHCHECK` de la tâche 0.
- Produces: service Compose `loki`, joignable en `http://loki:3100` sur le réseau `observability` et en `http://127.0.0.1:${LOKI_PORT:-3100}` sur l'hôte ; volume nommé `devops-store-loki-data`.

- [ ] **Step 1: Écrire la configuration Loki**

Créer `infrastructure/loki/loki-config.yml` :

```yaml
auth_enabled: false

server:
  http_listen_address: 0.0.0.0
  http_listen_port: 3100
  grpc_listen_port: 9096
  log_level: info

common:
  path_prefix: /loki
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules

schema_config:
  configs:
    - from: "2026-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  tsdb_shipper:
    active_index_directory: /loki/tsdb-index
    cache_location: /loki/tsdb-cache
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 168h
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 8
  ingestion_burst_size_mb: 16
  max_label_names_per_series: 15
  volume_enabled: true

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
  compaction_interval: 10m
  retention_delete_delay: 2h

ruler:
  storage:
    type: local
    local:
      directory: /loki/rules

analytics:
  reporting_enabled: false
```

- [ ] **Step 2: Valider la configuration sans démarrer le service**

```powershell
docker run --rm `
  -v "${PWD}\infrastructure\loki\loki-config.yml:/etc/loki/loki-config.yml:ro" `
  --entrypoint /usr/bin/loki grafana/loki:3.7.7 `
  -config.file=/etc/loki/loki-config.yml -verify-config
```

Attendu : sortie se terminant par une confirmation de configuration valide et code de sortie `0`. Si la configuration est refusée, corriger le fichier et relancer cette étape avant de continuer — ne pas passer à l'étape 3 sur une configuration invalide.

- [ ] **Step 3: Ajouter le service `loki` à `docker-compose.devops.yml`**

Insérer ce bloc dans `services:`, immédiatement après le service `grafana` et avant la clé `networks:` de premier niveau. Remplacer `<LOKI_HEALTHCHECK>` par la valeur produite à la tâche 0 ; si elle vaut `aucune`, supprimer entièrement la clé `healthcheck`.

```yaml
  loki:
    profiles: [observability]
    image: grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500
    user: "10001:10001"
    command:
      - -config.file=/etc/loki/loki-config.yml
    ports:
      - "127.0.0.1:${LOKI_PORT:-3100}:3100"
    volumes:
      - ./infrastructure/loki/loki-config.yml:/etc/loki/loki-config.yml:ro
      - loki-data:/loki
    healthcheck:
      test: <LOKI_HEALTHCHECK>
      interval: 10s
      timeout: 5s
      retries: 18
      start_period: 20s
    networks:
      - observability
      - observability-shared
    restart: unless-stopped
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cpus: 1.0
    mem_limit: 512m
    pids_limit: 200
```

- [ ] **Step 4: Déclarer le volume nommé**

Dans la section `volumes:` de `docker-compose.devops.yml`, après `grafana-data`, ajouter :

```yaml
  loki-data:
    name: devops-store-loki-data
```

- [ ] **Step 5: Valider le modèle Compose**

```powershell
docker compose -f docker-compose.devops.yml --profile observability config --quiet
```

Attendu : aucune sortie, code `0`. Une erreur `network devops-store-observability declared as external` signifie que le réseau applicatif n'existe pas encore ; ce n'est pas un défaut du bloc ajouté, démarrer l'application puis relancer.

- [ ] **Step 6: Démarrer Loki seul et vérifier l'écriture dans le volume**

```powershell
docker compose -f docker-compose.devops.yml --profile observability up -d loki
docker compose -f docker-compose.devops.yml --profile observability ps loki
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3100/ready
```

Attendu : le conteneur tourne et `/ready` finit par renvoyer `200`. Les premières secondes peuvent renvoyer `503 Ingester not ready`, c'est normal ; réessayer jusqu'à 60 secondes.

Si les journaux montrent `permission denied` sur `/loki`, le volume nommé n'a pas hérité des droits de l'image. Dans ce cas seulement, ajouter avant `loki` un service `loki-permissions` sur le modèle de `object-storage-permissions` de `docker-compose.yml` :

```yaml
  loki-permissions:
    profiles: [observability]
    image: grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500
    user: "0:0"
    entrypoint: ["/bin/chown", "-R", "10001:10001", "/loki"]
    volumes:
      - loki-data:/loki
    networks:
      - observability
    restart: "no"
    mem_limit: 128m
    pids_limit: 50
```

et faire dépendre `loki` de `loki-permissions` avec `condition: service_completed_successfully`. Ne pas ajouter ce service si le message d'erreur n'a pas été observé.

- [ ] **Step 7: Vérifier la rétention appliquée**

```powershell
docker compose -f docker-compose.devops.yml --profile observability logs loki --tail=200 | Select-String -Pattern "retention|compactor"
```

Attendu : au moins une ligne confirmant le démarrage du compacteur avec la rétention activée. Si le compacteur n'est pas démarré, la rétention déclarée n'est pas appliquée : corriger la section `compactor` avant de continuer.

- [ ] **Step 8: Arrêter Loki en conservant le volume**

```powershell
docker compose -f docker-compose.devops.yml --profile observability stop loki
docker compose -f docker-compose.devops.yml --profile observability rm -f loki
```

- [ ] **Step 9: Commit (sur autorisation explicite uniquement)**

```bash
git add infrastructure/loki/loki-config.yml docker-compose.devops.yml
git commit -m "feat(observability): add Loki single-binary service"
```

---

### Task 2: Proxy Docker restreint

**Files:**
- Modify: `docker-compose.devops.yml` (section `services`, avant `loki`)
- Modify: `.env.example`
- Test: vérification réelle des routes autorisées et refusées depuis un conteneur du réseau `observability`

**Interfaces:**
- Consumes: `DOCKER_GID` de la tâche 0.
- Produces: service Compose `socket-proxy` exposant l'API Docker filtrée sur `tcp://socket-proxy:2375`, joignable uniquement depuis le réseau interne `observability`.

- [ ] **Step 1: Ajouter le service `socket-proxy`**

Insérer dans `services:` de `docker-compose.devops.yml`, juste avant le service `loki` :

```yaml
  socket-proxy:
    profiles: [observability]
    image: wollomatic/socket-proxy:1.13.1@sha256:3935b709275e4ec35d6ed5a5c4a1f0d01ed31eec5e7234efc3357ecd47689002
    user: "65534:${DOCKER_GID:-999}"
    command:
      - -loglevel=info
      - -listenip=0.0.0.0
      - -proxyport=2375
      - -allowfrom=alloy
      - -allowGET=/v1\..{1,2}/(version|containers|containers/.*)
      - -allowPOST=/v1\..{1,2}/containers/.*/logs
      - -watchdoginterval=600
      - -stoponwatchdog
      - -shutdowngracetime=5
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - observability
    restart: unless-stopped
    stop_grace_period: 10s
    read_only: true
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cpus: 0.5
    mem_limit: 64m
    pids_limit: 50
```

Remplacer `999` par la valeur réellement lue à la tâche 0 si elle diffère. Ce service ne publie aucun port et ne rejoint pas `observability-shared` : il ne doit pas être joignable depuis l'hôte.

- [ ] **Step 2: Déclarer `DOCKER_GID` dans `.env.example`**

Dans le bloc observabilité de `.env.example`, après `GRAFANA_ADMIN_PASSWORD=`, ajouter :

```dotenv
LOKI_PORT=3100
ALLOY_PORT=12345
# GID du groupe docker dans la VM Docker Desktop, lu avec:
# docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro busybox:1.37.0 stat -c '%g' /var/run/docker.sock
DOCKER_GID=999
```

Aucun secret n'est introduit : ces trois valeurs sont des paramètres locaux.

- [ ] **Step 3: Valider le modèle Compose**

```powershell
docker compose -f docker-compose.devops.yml --profile observability config --quiet
```

Attendu : aucune sortie, code `0`.

- [ ] **Step 4: Démarrer le proxy**

```powershell
docker compose -f docker-compose.devops.yml --profile observability up -d socket-proxy
docker compose -f docker-compose.devops.yml --profile observability logs socket-proxy --tail=30
```

Attendu : le proxy annonce qu'il écoute sur `2375`. Un message de refus d'accès au socket signifie que `DOCKER_GID` est faux : corriger la valeur, pas les droits du socket.

- [ ] **Step 5: Vérifier qu'une route autorisée passe**

```powershell
docker run --rm --network devops-store_observability `
  --hostname alloy --name alloy `
  curlimages/curl:8.22.0 -s -o /dev/null -w "%{http_code}\n" `
  http://socket-proxy:2375/v1.51/containers/json
```

Attendu : `200`. Le nom de réseau réel peut différer ; le lire avec `docker network ls` et utiliser celui du projet outillage. Le conteneur doit porter le nom d'hôte `alloy`, car `-allowfrom` filtre sur le nom résolu du client.

- [ ] **Step 6: Vérifier qu'une route interdite est refusée**

```powershell
docker run --rm --network devops-store_observability `
  --hostname alloy --name alloy `
  curlimages/curl:8.22.0 -s -o /dev/null -w "%{http_code}\n" `
  -X POST http://socket-proxy:2375/v1.51/containers/create
```

Attendu : un code `4xx` de refus, jamais `200` ni `201`. Ce contrôle est la preuve que le proxy restreint réellement l'API ; ne pas continuer sans cette sortie.

- [ ] **Step 7: Vérifier que le proxy n'est pas joignable depuis l'hôte**

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" --max-time 5 http://localhost:2375/v1.51/containers/json
```

Attendu : échec de connexion, pas une réponse HTTP. Une réponse signifierait qu'un port a été publié par erreur.

- [ ] **Step 8: Arrêter le proxy**

```powershell
docker compose -f docker-compose.devops.yml --profile observability stop socket-proxy
docker compose -f docker-compose.devops.yml --profile observability rm -f socket-proxy
```

- [ ] **Step 9: Commit (sur autorisation explicite uniquement)**

```bash
git add docker-compose.devops.yml .env.example
git commit -m "feat(observability): add restricted Docker socket proxy"
```

---

### Task 3: Pipeline Alloy

**Files:**
- Create: `infrastructure/alloy/config.alloy`
- Modify: `docker-compose.devops.yml` (section `services`, après `loki` ; section `volumes:`)
- Test: validation de configuration en conteneur jetable, puis vérification des labels réellement présents dans Loki

**Interfaces:**
- Consumes: `socket-proxy` (tâche 2), `loki` (tâche 1), `ALLOY_VALIDATE_CMD` et `ALLOY_HEALTHCHECK` (tâche 0).
- Produces: service Compose `alloy` ; flux Loki étiquetés `service_name`, `container`, `level` ; `service_name` du backend vaut exactement `devops-store-backend`.

- [ ] **Step 1: Écrire le pipeline Alloy**

Créer `infrastructure/alloy/config.alloy` :

```alloy
discovery.docker "project_containers" {
	host             = "tcp://socket-proxy:2375"
	refresh_interval = "15s"

	filter {
		name   = "label"
		values = ["com.docker.compose.project=devops-store"]
	}
}

discovery.relabel "project_containers" {
	targets = discovery.docker.project_containers.targets

	rule {
		source_labels = [
			"__meta_docker_container_label_com_docker_compose_project",
			"__meta_docker_container_label_com_docker_compose_service",
		]
		separator    = "-"
		regex        = "(.+)"
		target_label = "service_name"
		replacement  = "$1"
	}

	rule {
		source_labels = ["__meta_docker_container_name"]
		regex         = "/?(.*)"
		target_label  = "container"
		replacement   = "$1"
	}
}

loki.source.docker "project_containers" {
	host             = "tcp://socket-proxy:2375"
	targets          = discovery.relabel.project_containers.output
	refresh_interval = "15s"
	forward_to       = [loki.process.logstash_json.receiver]
}

loki.process "logstash_json" {
	forward_to = [loki.write.local.receiver]

	stage.json {
		expressions = {
			level     = "level",
			timestamp = "\"@timestamp\"",
		}
	}

	stage.timestamp {
		source            = "timestamp"
		format            = "RFC3339"
		action_on_failure = "skip"
	}

	stage.labels {
		values = {
			level = "level",
		}
	}
}

loki.write "local" {
	endpoint {
		url = "http://loki:3100/loki/api/v1/push"
	}
}
```

Le contenu de la ligne n'est jamais remplacé : `stage.json` n'extrait que des variables de travail, donc `requestId`, `logger_name`, `thread_name` et `message` restent dans le JSON poussé.

- [ ] **Step 2: Valider la configuration sans démarrer le service**

```powershell
docker run --rm `
  -v "${PWD}\infrastructure\alloy\config.alloy:/etc/alloy/config.alloy:ro" `
  --entrypoint /bin/alloy grafana/alloy:v1.19.2 `
  validate /etc/alloy/config.alloy
```

Utiliser `ALLOY_VALIDATE_CMD` de la tâche 0 si `validate` n'existe pas. Attendu : code `0`. Corriger toute erreur de syntaxe avant l'étape suivante.

- [ ] **Step 3: Ajouter le service `alloy`**

Insérer dans `services:` de `docker-compose.devops.yml`, après le service `loki`. Remplacer `<ALLOY_HEALTHCHECK>` par la valeur de la tâche 0 ; si elle vaut `aucune`, supprimer la clé `healthcheck` entière.

```yaml
  alloy:
    profiles: [observability]
    image: grafana/alloy:v1.19.2@sha256:b8ec653c44235fbe910879145dac3597d66b0aaecf60bcbbe82580767771a839
    user: "473:473"
    command:
      - run
      - --server.http.listen-addr=0.0.0.0:12345
      - --storage.path=/var/lib/alloy/data
      - --disable-reporting
      - /etc/alloy/config.alloy
    ports:
      - "127.0.0.1:${ALLOY_PORT:-12345}:12345"
    volumes:
      - ./infrastructure/alloy/config.alloy:/etc/alloy/config.alloy:ro
      - alloy-data:/var/lib/alloy
    healthcheck:
      test: <ALLOY_HEALTHCHECK>
      interval: 10s
      timeout: 5s
      retries: 18
      start_period: 20s
    depends_on:
      socket-proxy:
        condition: service_started
      loki:
        condition: service_healthy
    networks:
      - observability
      - observability-shared
    restart: unless-stopped
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cpus: 1.0
    mem_limit: 512m
    pids_limit: 200
```

Si `loki` n'a pas de `healthcheck` (cas `aucune` de la tâche 0), utiliser `condition: service_started` pour `loki` également.

- [ ] **Step 4: Déclarer le volume de positions**

Dans la section `volumes:`, après `loki-data`, ajouter :

```yaml
  alloy-data:
    name: devops-store-alloy-data
```

- [ ] **Step 5: Valider le modèle Compose**

```powershell
docker compose -f docker-compose.devops.yml --profile observability config --quiet
```

Attendu : aucune sortie, code `0`.

- [ ] **Step 6: Démarrer l'application puis la chaîne de collecte**

```powershell
docker compose up -d --wait
docker compose -f docker-compose.devops.yml --profile observability up -d socket-proxy loki alloy
docker compose -f docker-compose.devops.yml --profile observability ps socket-proxy loki alloy
```

Attendu : les trois conteneurs tournent. `alloy` doit rester en vie : un redémarrage en boucle signale une erreur de configuration visible dans ses journaux.

- [ ] **Step 7: Vérifier les labels réellement indexés**

```powershell
curl.exe -s http://localhost:3100/loki/api/v1/labels
curl.exe -s "http://localhost:3100/loki/api/v1/label/service_name/values"
```

Attendu : la liste des labels contient `service_name`, `container` et `level` et rien d'autre en dehors des labels techniques ajoutés par Loki. Les valeurs de `service_name` contiennent `devops-store-backend`. Si `requestId` ou `logger_name` apparaissent comme labels, la contrainte de cardinalité est violée : corriger `stage.labels` avant de continuer.

- [ ] **Step 8: Vérifier que le contenu JSON est préservé**

```powershell
curl.exe -s -G http://localhost:3100/loki/api/v1/query_range `
  --data-urlencode "query={service_name=`"devops-store-backend`"}" `
  --data-urlencode "limit=1"
```

Attendu : la ligne retournée est le JSON Logstash d'origine, avec `@timestamp`, `level`, `logger_name`, `thread_name` et `message`.

- [ ] **Step 9: Vérifier le comportement sur les conteneurs non JSON**

```powershell
curl.exe -s "http://localhost:3100/loki/api/v1/label/service_name/values"
curl.exe -s -G http://localhost:3100/loki/api/v1/query_range `
  --data-urlencode "query={service_name=`"devops-store-postgres`"}" `
  --data-urlencode "limit=1"
```

Attendu : `devops-store-postgres` et `devops-store-frontend` apparaissent, leurs lignes sont indexées sans label `level`, et le pipeline n'a pas échoué. Les journaux d'Alloy ne doivent pas être saturés d'erreurs de parsing.

- [ ] **Step 10: Commit (sur autorisation explicite uniquement)**

```bash
git add infrastructure/alloy/config.alloy docker-compose.devops.yml
git commit -m "feat(observability): collect project container logs with Alloy"
```

---

### Task 4: Datasource Loki et panneau de logs Grafana

**Files:**
- Create: `infrastructure/grafana/provisioning/datasources/loki.yml`
- Modify: `infrastructure/grafana/dashboards/backend-overview.json`
- Test: contrôle du JSON provisionné puis vérification réelle via l'API Grafana

**Interfaces:**
- Consumes: service `loki` (tâche 1) et labels produits par Alloy (tâche 3).
- Produces: datasource Grafana d'UID `loki` ; panneau `id: 10`, type `logs`, titre `Backend logs` dans le dashboard d'UID `devops-store-backend`.

- [ ] **Step 1: Créer la datasource Loki**

Créer `infrastructure/grafana/provisioning/datasources/loki.yml` :

```yaml
apiVersion: 1
prune: true

datasources:
  - name: Loki
    uid: loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: false
    jsonData:
      maxLines: 1000
      timeout: 60
```

Ne pas modifier `prometheus.yml` : l'UID `prometheus` et son statut `isDefault: true` restent inchangés.

- [ ] **Step 2: Ajouter le panneau de logs au dashboard**

Dans `infrastructure/grafana/dashboards/backend-overview.json`, ajouter cet objet à la fin du tableau `panels`, après le panneau `id: 9` :

```json
    {
      "datasource": {"type": "loki", "uid": "loki"},
      "gridPos": {"h": 10, "w": 24, "x": 0, "y": 28},
      "id": 10,
      "options": {"dedupStrategy": "none", "enableLogDetails": true, "prettifyLogMessage": true, "showCommonLabels": false, "showLabels": false, "showTime": true, "sortOrder": "Descending", "wrapLogMessage": true},
      "targets": [{"datasource": {"type": "loki", "uid": "loki"}, "editorMode": "code", "expr": "{service_name=\"devops-store-backend\"}", "queryType": "range", "refId": "A"}],
      "title": "Backend logs",
      "type": "logs"
    }
```

Dans le même fichier, remplacer `"tags": ["devops-store", "spring-boot", "prometheus"]` par `"tags": ["devops-store", "spring-boot", "prometheus", "loki"]` et `"version": 1` par `"version": 2`.

- [ ] **Step 3: Vérifier que le JSON reste valide et cohérent**

```powershell
python -c "import json; d=json.load(open('infrastructure/grafana/dashboards/backend-overview.json')); print(len(d['panels']), d['version'], sorted({p['datasource']['uid'] for p in d['panels']}))"
```

Attendu : `10 2 ['loki', 'prometheus']`. Tout autre UID signale une erreur de saisie.

- [ ] **Step 4: Démarrer Grafana avec le reste de la chaîne**

```powershell
docker compose -f docker-compose.devops.yml --profile observability up -d --wait prometheus grafana socket-proxy loki alloy
```

Attendu : les services deviennent sains. `GRAFANA_ADMIN_PASSWORD` doit être défini dans `.env` ; ne jamais deviner ni inventer ce mot de passe.

- [ ] **Step 5: Vérifier la datasource provisionnée**

```powershell
$pair = "admin:$($env:GRAFANA_ADMIN_PASSWORD)"
curl.exe -s -u $pair http://localhost:3000/api/datasources | python -c "import json,sys; print([(d['uid'], d['type'], d['readOnly']) for d in json.load(sys.stdin)])"
```

Attendu : les deux entrées `('prometheus', 'prometheus', True)` et `('loki', 'loki', True)`.

- [ ] **Step 6: Vérifier le dashboard provisionné**

```powershell
curl.exe -s -u $pair http://localhost:3000/api/dashboards/uid/devops-store-backend | python -c "import json,sys; d=json.load(sys.stdin); print(d['meta']['provisioned'], len(d['dashboard']['panels']), d['dashboard']['panels'][-1]['type'])"
```

Attendu : `True 10 logs`.

- [ ] **Step 7: Vérifier que la datasource Loki répond réellement depuis Grafana**

```powershell
curl.exe -s -u $pair "http://localhost:3000/api/datasources/uid/loki/health"
```

Attendu : un statut `OK`. Un échec ici, alors que `curl` direct sur `3100` fonctionne, signale un problème de réseau Docker entre Grafana et Loki, pas de provisioning.

- [ ] **Step 8: Commit (sur autorisation explicite uniquement)**

```bash
git add infrastructure/grafana/provisioning/datasources/loki.yml infrastructure/grafana/dashboards/backend-overview.json
git commit -m "feat(observability): provision Loki datasource and backend log panel"
```

---

### Task 5: Extension des cibles Make

**Files:**
- Modify: `Makefile` (variables d'images en tête ; six recettes `observability-*` lignes 206 à 233)
- Test: exécution réelle des cibles dans un conteneur disposant de GNU Make

**Interfaces:**
- Consumes: services des tâches 1 à 4.
- Produces: `observability-config`, `observability-up`, `observability-down`, `observability-status`, `observability-logs`, `observability-reset` couvrant les cinq services.

- [ ] **Step 1: Ajouter les variables d'images**

Après la ligne `PROMETHEUS_IMAGE ?= ...` du `Makefile`, ajouter :

```make
LOKI_IMAGE ?= grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500
ALLOY_IMAGE ?= grafana/alloy:v1.19.2@sha256:b8ec653c44235fbe910879145dac3597d66b0aaecf60bcbbe82580767771a839
OBSERVABILITY_SERVICES ?= prometheus grafana socket-proxy loki alloy
```

- [ ] **Step 2: Étendre `observability-config`**

Remplacer la recette existante par :

```make
observability-config: ## Validate Prometheus, Loki, Alloy and the observability Compose profile
	$(COMPOSE) config --quiet
	$(DEVOPS_COMPOSE) --profile observability config --quiet
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
		--entrypoint /bin/promtool $(PROMETHEUS_IMAGE) \
		check config /etc/prometheus/prometheus.yml
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/loki/loki-config.yml:/etc/loki/loki-config.yml:ro" \
		--entrypoint /usr/bin/loki $(LOKI_IMAGE) \
		-config.file=/etc/loki/loki-config.yml -verify-config
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/alloy/config.alloy:/etc/alloy/config.alloy:ro" \
		--entrypoint /bin/alloy $(ALLOY_IMAGE) \
		validate /etc/alloy/config.alloy
```

Si la tâche 0 a montré que `validate` n'existe pas, utiliser `fmt /etc/alloy/config.alloy` à la place, et seulement dans ce cas.

- [ ] **Step 3: Étendre les quatre recettes de cycle de vie**

```make
observability-up: ## Start the application, Prometheus, Grafana, Loki and Alloy
	$(MAKE) application
	$(DEVOPS_COMPOSE) --profile observability up -d --wait $(OBSERVABILITY_SERVICES)

observability-down: ## Stop observability while preserving its data
	$(DEVOPS_COMPOSE) --profile observability stop alloy loki socket-proxy grafana prometheus
	$(DEVOPS_COMPOSE) --profile observability rm -f alloy loki socket-proxy grafana prometheus

observability-status: ## Show observability container health
	$(DEVOPS_COMPOSE) --profile observability ps $(OBSERVABILITY_SERVICES)

observability-logs: ## Follow observability logs
	$(DEVOPS_COMPOSE) --profile observability logs --follow --tail=200 $(OBSERVABILITY_SERVICES)
```

L'ordre d'arrêt est volontairement l'inverse de l'ordre de démarrage : Alloy d'abord, pour qu'il cesse d'écrire avant l'arrêt de Loki.

- [ ] **Step 4: Étendre `observability-reset`**

```make
observability-reset: observability-down ## Delete only Prometheus, Grafana, Loki and Alloy local data
	@for volume in devops-store-prometheus-data devops-store-grafana-data devops-store-loki-data devops-store-alloy-data; do \
		if $(DOCKER) volume inspect "$$volume" >/dev/null 2>&1; then \
			$(DOCKER) volume rm "$$volume"; \
		fi; \
	done
```

- [ ] **Step 5: Mettre à jour l'aide**

Dans le bloc `$(info ...)` du `Makefile`, remplacer les quatre descriptions d'observabilité concernées pour qu'elles mentionnent Loki et Alloy, en gardant l'alignement des colonnes existant.

- [ ] **Step 6: Vérifier la syntaxe des recettes**

GNU Make peut être absent du `PATH` Windows. Utiliser un conteneur éphémère :

```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace maven:3.9.16-eclipse-temurin-25 `
  make --dry-run observability-config observability-up observability-down observability-status observability-reset
```

Attendu : les commandes sont développées sans erreur de syntaxe Make, et les cinq services apparaissent dans les listes. `--dry-run` n'exécute rien : ce n'est pas une preuve de fonctionnement, seulement de syntaxe.

- [ ] **Step 7: Exécuter réellement les cibles de lecture sur l'hôte**

```powershell
docker compose -f docker-compose.devops.yml --profile observability config --quiet
docker compose -f docker-compose.devops.yml --profile observability ps prometheus grafana socket-proxy loki alloy
```

Attendu : validation silencieuse, puis les cinq services listés. Cette étape établit l'équivalent réel des recettes sans dépendre de GNU Make.

- [ ] **Step 8: Commit (sur autorisation explicite uniquement)**

```bash
git add Makefile
git commit -m "chore(observability): extend observability targets to Loki and Alloy"
```

---

### Task 6: Documentation

**Files:**
- Create: `docs/observability/loki.md`, `docs/observability/alloy.md`
- Modify: `docs/observability/grafana.md`, `docs/README.md`, `README.md`, `AGENTS.md`
- Test: relecture croisée des commandes citées contre les fichiers réels

**Interfaces:**
- Consumes: tâches 1 à 5.
- Produces: guides d'exploitation et index à jour, sans affirmation non vérifiée.

- [ ] **Step 1: Écrire `docs/observability/loki.md`**

Structure imposée, sur le modèle de `docs/observability/prometheus.md` :

1. rôle de Loki dans la phase 12 et périmètre (logs Docker du projet `devops-store` uniquement) ;
2. image épinglée, port `127.0.0.1:3100`, réseaux et volume `devops-store-loki-data` ;
3. configuration : schéma v13, stockage fichier, rétention `168h`, compacteur ;
4. commandes de démarrage, d'arrêt et de reset ;
5. les quatre requêtes LogQL imposées, copiables :

```logql
{service_name="devops-store-backend", level="ERROR"}
{service_name="devops-store-backend", level="WARN"}
{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductController"
{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductService"
```

6. diagnostic : `/ready` en `503` au démarrage, entrées rejetées hors fenêtre `reject_old_samples_max_age`, volume saturé ;
7. limites assumées : pas d'authentification, instance mono-nœud, pas de stockage objet.

- [ ] **Step 2: Écrire `docs/observability/alloy.md`**

Structure imposée :

1. rôle d'Alloy et schéma du flux `socket-proxy -> alloy -> loki` ;
2. pourquoi Alloy n'a pas accès au socket Docker et ce que le proxy autorise exactement, avec les deux expressions régulières ;
3. `DOCKER_GID` : comment le lire, symptôme d'une valeur fausse ;
4. pipeline étape par étape et justification des trois labels ;
5. ce qui reste dans le contenu (`requestId`, `logger_name`, `thread_name`, `message`) et pourquoi ;
6. comportement attendu sur les conteneurs non JSON ;
7. diagnostic : `http://localhost:12345/-/ready`, page d'état d'Alloy, volume de positions.

- [ ] **Step 3: Compléter `docs/observability/grafana.md`**

Ajouter une section décrivant la datasource `loki`, le panneau `Backend logs` et le fait que les deux datasources sont provisionnées en lecture seule. Ne pas réécrire les sections existantes.

- [ ] **Step 4: Mettre à jour `docs/README.md`**

Ajouter les deux nouveaux guides à l'index, dans la même section que Prometheus et Grafana.

- [ ] **Step 5: Mettre à jour `README.md`**

Ajouter Loki et Alloy à la description du profil `observability`, avec leurs URLs locales `http://localhost:3100` et `http://localhost:12345`. Distinguer explicitement ce qui est disponible de ce qui reste planifié (Kubernetes, phase 13).

- [ ] **Step 6: Mettre à jour `AGENTS.md`**

Dans « Stack / Implémentée », ajouter Loki 3.7.7, Alloy 1.19.2 et socket-proxy 1.13.1. Dans « Configuration locale », ajouter `LOKI_PORT`, `ALLOY_PORT` et `DOCKER_GID`. Mettre à jour la phrase décrivant `observability-down` et `observability-reset` pour mentionner les quatre volumes. Retirer Loki et Alloy de la cible planifiée.

- [ ] **Step 7: Vérifier qu'aucune commande documentée n'est inventée**

```powershell
Select-String -Path docs/observability/loki.md, docs/observability/alloy.md, README.md, AGENTS.md -Pattern "make " | Select-Object -ExpandProperty Line
```

Attendu : chaque cible Make citée existe réellement dans le `Makefile`. Toute cible citée mais absente est un défaut à corriger immédiatement.

- [ ] **Step 8: Commit (sur autorisation explicite uniquement)**

```bash
git add docs/observability/loki.md docs/observability/alloy.md docs/observability/grafana.md docs/README.md README.md AGENTS.md
git commit -m "docs(observability): document the Loki and Alloy log pipeline"
```

---

### Task 7: Acceptance dynamique de bout en bout

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (cases de la phase 12, à la toute fin de la tâche)
- Test: parcours réel complet

**Interfaces:**
- Consumes: tâches 1 à 6.
- Produces: preuves réelles des six critères d'acceptation de la spécification.

- [ ] **Step 1: Repartir d'un état propre**

```powershell
docker compose -f docker-compose.devops.yml --profile observability down
docker compose up -d --wait
docker compose -f docker-compose.devops.yml --profile observability up -d --wait prometheus grafana socket-proxy loki alloy
docker compose -f docker-compose.devops.yml --profile observability ps prometheus grafana socket-proxy loki alloy
```

Attendu : les cinq services sont `healthy`, ou `running` pour ceux dont la tâche 0 a montré qu'aucune sonde n'est disponible.

Si le nom de projet Compose dérive vers `devops-store_application` depuis le worktree, forcer `--project-directory` sur le répertoire historique, comme en phase 11.

- [ ] **Step 2: Vérifier les deux points de disponibilité**

```powershell
curl.exe -s -o NUL -w "loki=%{http_code}`n" http://localhost:3100/ready
curl.exe -s -o NUL -w "alloy=%{http_code}`n" http://localhost:12345/-/ready
```

Attendu : `loki=200` et `alloy=200`.

- [ ] **Step 3: Générer du trafic applicatif réel**

Réutiliser le script d'acceptance de la phase 11 : connexion avec l'en-tête `Origin: http://localhost:4200` obligatoire, création puis suppression d'un produit, et au moins une requête invalide pour produire une ligne `WARN` ou `ERROR`. Ne jamais deviner un mot de passe : utiliser l'identité de validation autorisée par l'utilisateur, conservée hors Git.

- [ ] **Step 4: Vérifier la présence d'un log backend récent avec ses champs**

```powershell
curl.exe -s -G http://localhost:3100/loki/api/v1/query_range `
  --data-urlencode "query={service_name=`"devops-store-backend`"}" `
  --data-urlencode "limit=5"
```

Attendu : des lignes récentes contenant `@timestamp`, `level`, `logger_name` et `requestId`. C'est la preuve du premier critère d'acceptation, complétée à l'étape 6 côté Grafana.

- [ ] **Step 5: Exécuter les quatre recherches imposées**

```powershell
$queries = @(
  '{service_name="devops-store-backend", level="ERROR"}',
  '{service_name="devops-store-backend", level="WARN"}',
  '{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductController"',
  '{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductService"'
)
foreach ($q in $queries) {
  $r = curl.exe -s -G http://localhost:3100/loki/api/v1/query_range --data-urlencode "query=$q" --data-urlencode "limit=5"
  "$q => " + ($r | python -c "import json,sys; print(len(json.load(sys.stdin)['data']['result']))")
}
```

Attendu : un nombre de flux non nul pour chaque requête dont les événements ont réellement été produits à l'étape 3. Si une requête retourne zéro, déterminer si l'événement correspondant a bien été généré avant de conclure à un défaut du pipeline.

- [ ] **Step 6: Vérifier le panneau de logs dans Grafana**

Ouvrir `http://localhost:3000`, dossier `DevOps Store`, dashboard `DevOps Store — Backend Overview`. Attendu : le panneau `Backend logs` affiche des lignes récentes avec horodatage, niveau et logger lisibles après ouverture du détail d'une ligne.

- [ ] **Step 7: Vérifier l'absence de secret, de prix et de description produit**

```powershell
docker compose logs backend --tail=500 | Select-String -Pattern "password|secret|token|jwt|price|description" -CaseSensitive:$false
```

Attendu : aucune correspondance révélant une valeur réelle. Une correspondance sur un nom de champ technique sans valeur sensible est acceptable et doit être justifiée explicitement dans `progress.md`. C'est le troisième critère d'acceptation.

- [ ] **Step 8: Vérifier le périmètre de collecte et la cardinalité**

```powershell
curl.exe -s http://localhost:3100/loki/api/v1/labels
curl.exe -s "http://localhost:3100/loki/api/v1/label/service_name/values"
docker inspect --format '{{range .Mounts}}{{.Source}} {{end}}' $(docker compose -f docker-compose.devops.yml --profile observability ps -q alloy)
```

Attendu : labels limités à `service_name`, `container`, `level` ; valeurs de `service_name` toutes préfixées par `devops-store-` ; aucun montage de `docker.sock` dans Alloy. Ce sont les quatrième et cinquième critères.

- [ ] **Step 9: Vérifier la sémantique de `down` et de `reset`**

```powershell
docker compose -f docker-compose.devops.yml --profile observability stop alloy loki socket-proxy grafana prometheus
docker compose -f docker-compose.devops.yml --profile observability rm -f alloy loki socket-proxy grafana prometheus
docker volume inspect devops-store-loki-data --format '{{.Name}}'
docker compose ps
```

Attendu : le volume Loki existe toujours et l'application reste saine. C'est le sixième critère ; la suppression par `observability-reset` n'est vérifiée qu'ensuite, et seulement si l'utilisateur accepte de perdre les données locales collectées.

- [ ] **Step 10: Mettre à jour `docs/IMPLEMENTATION_PLAN.md`**

Cocher les cases d'implémentation et d'acceptation de la phase 12 uniquement pour ce qui a produit une sortie réelle. Corriger les versions annoncées (`Loki 3.7.7` et `Alloy 1.19.2` au lieu de `3.7` et `1.18`) et dater le statut. Ne cocher aucune case dont la preuve manque.

- [ ] **Step 11: Commit (sur autorisation explicite uniquement)**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: record phase 12 acceptance evidence"
```

---

### Task 8: Régression, revue et livraison

**Files:**
- Modify: `progress.md`, `findings.md`, `task_plan.md` (non suivis par Git)
- Test: validations de régression proportionnées au périmètre touché

**Interfaces:**
- Consumes: tâches 0 à 7.
- Produces: diff revu, preuves consolidées, décision de livraison.

- [ ] **Step 1: Contrôles de forme**

```powershell
git diff --check
git status --short
```

Attendu : aucune erreur d'espaces, et seuls les fichiers du périmètre apparaissent.

- [ ] **Step 2: Régression Compose et Prometheus**

```powershell
docker compose config --quiet
docker compose -f docker-compose.devops.yml --profile observability config --quiet
docker run --rm -v "${PWD}\infrastructure\prometheus\prometheus.yml:/etc/prometheus/prometheus.yml:ro" `
  --entrypoint /bin/promtool prom/prometheus:v3.14.0-distroless `
  check config /etc/prometheus/prometheus.yml
```

Attendu : trois validations vertes. Le backend et le frontend n'étant pas modifiés, aucun build Maven ni npm n'est requis par ce périmètre.

- [ ] **Step 3: Régression Trivy sur les configurations**

```powershell
make trivy-config
```

Si GNU Make est absent, exécuter la commande Trivy équivalente lue dans le `Makefile`. Attendu : aucune mauvaise configuration nouvelle sur les fichiers ajoutés. Toute alerte sur `socket-proxy`, `loki` ou `alloy` doit être corrigée ou justifiée explicitement.

- [ ] **Step 4: Relire le diff complet**

```powershell
git diff --stat
git diff
```

Vérifier point par point : aucun secret, aucun montage de socket hors `socket-proxy`, aucune modification des neuf panneaux existants, aucun fichier backend ou frontend touché.

- [ ] **Step 5: Mettre à jour les fichiers de suivi**

Consigner dans `progress.md` les preuves réelles par critère d'acceptation, et dans `findings.md` les écarts rencontrés (sondes indisponibles, GID, droits de volume, dérive du nom de projet Compose). Marquer les phases de `task_plan.md`.

- [ ] **Step 6: Demander la décision de livraison**

Présenter à l'utilisateur : le diff résumé, les preuves, les points restés ouverts. Rappeler que la PR #42 (`fix/grafana-password-check`) touche le même service Grafana et devrait être fusionnée avant cette branche pour éviter un conflit. Ne créer aucun commit, push ou PR sans autorisation explicite.

---

## Notes d'exécution

- **Ordre des tâches :** 0 puis 1, 2, 3 dans cet ordre. La tâche 3 ne peut pas être validée sans les tâches 1 et 2 démarrées. Les tâches 4, 5, 6 sont indépendantes entre elles une fois la tâche 3 verte.
- **Dépendance externe :** la PR #42 modifie la déclaration de `GRAFANA_ADMIN_PASSWORD` dans le même fichier `docker-compose.devops.yml`. Un conflit de fusion est probable si les deux branches avancent en parallèle sur ce fichier ; le résoudre en conservant la version de la PR #42 pour la ligne du mot de passe.
- **Ne jamais** annoncer une étape verte sans sa sortie réelle, ni deviner un mot de passe, ni créer une identité applicative ou Grafana sans autorisation explicite.
