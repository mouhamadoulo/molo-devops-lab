# Grafana Alloy

## Rôle et flux

Alloy collecte les journaux des conteneurs du projet Compose applicatif et les pousse vers Loki.

```text
Docker Engine  <--(socket, lecture seule)--  socket-proxy  <--(API HTTP filtrée)--  alloy  --(push)-->  loki
```

Alloy n'a aucun accès au socket Docker. Seul `socket-proxy` le monte, en lecture seule, et n'expose
qu'un sous-ensemble de l'API Docker sur le réseau interne `observability`. Le proxy ne publie aucun
port sur l'hôte.

## Ce que le proxy autorise

`wollomatic/socket-proxy` est une image construite `FROM scratch`, sans shell ni bibliothèque
système, exécutée sans capacité, en système de fichiers en lecture seule et limitée à 64 Mio.

| Méthode | Expression régulière autorisée | Usage |
|---|---|---|
| `GET` | `/v1\..{1,2}/(version\|containers\|containers/.*\|networks\|networks/.*)` | version de l'API, liste et inspection des conteneurs, labels réseau |
| `POST` | `/v1\..{1,2}/containers/.*/logs` | lecture des journaux d'un conteneur |

Tout le reste est refusé par le proxy avec un code `403`, y compris la création, l'exécution et la
suppression de conteneurs, ainsi que la liste des images.

Les routes `networks` sont nécessaires : `discovery.docker` calcule les labels réseau de chaque
cible. Sans elles, Alloy répète `Unable to refresh target groups ... error while computing network
labels: Error response from daemon: Forbidden` et ne collecte rien.

Le chien de garde (`-watchdoginterval`, `-stoponwatchdog`) arrête le proxy si le socket devient
indisponible, afin que l'incident soit visible plutôt que silencieux.

## Variable `DOCKER_GID`

Le proxy s'exécute en `65534:${DOCKER_GID}`. La valeur doit être le groupe propriétaire du socket
dans la machine où tourne le démon Docker :

```powershell
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro busybox:1.37.0 `
  stat -c 'mode=%a owner=%u group=%g' /var/run/docker.sock
```

Sous Docker Desktop, la sortie est `mode=660 owner=0 group=0` : il n'existe pas de groupe `docker`
distinct et `DOCKER_GID` vaut `0`. Sur une machine Linux avec un groupe `docker`, la valeur est son
GID. Une valeur fausse provoque un refus d'accès au socket au démarrage du proxy ; corriger la
variable, jamais les droits du socket.

## Pipeline

La configuration versionnée est `infrastructure/alloy/config.alloy`.

1. `discovery.docker` interroge `tcp://socket-proxy:2375` et filtre sur le label
   `com.docker.compose.project=devops-store` : seuls les conteneurs de l'application sont candidats.
2. `discovery.relabel` construit deux labels :
   - `service_name` concatène le projet et le service Compose, donc le backend devient
     `devops-store-backend` ;
   - `container` reprend le nom du conteneur.
3. `loki.source.docker` lit les journaux des cibles retenues.
4. `loki.process` extrait `level` et `@timestamp` du JSON Logstash, aligne l'horodatage sur celui
   de l'application et promeut `level` en label.
5. `loki.write` pousse vers `http://loki:3100/loki/api/v1/push`.

## Labels et contenu

Les seuls labels indexés sont `service_name`, `container` et `level`. Ce choix borne la cardinalité
de l'index : un label par requête, par identifiant ou par message ferait exploser le nombre de flux.

La ligne n'est jamais réécrite. `requestId`, `logger_name`, `thread_name`, `level_value` et
`message` restent dans le JSON poussé et s'interrogent avec l'analyseur `| json` de LogQL.

Vérification :

```powershell
curl.exe -s http://localhost:3100/loki/api/v1/labels
```

La réponse attendue est exactement `["container","level","service_name"]`.

## Conteneurs non JSON

`postgres`, `object-storage` et `frontend` n'émettent pas de JSON Logstash. Leurs lignes traversent
le même pipeline : l'extraction JSON échoue sans interrompre le flux, l'horodatage Docker est
conservé grâce à `action_on_failure: skip`, et la ligne est indexée avec `service_name` et
`container` seuls, sans label `level`. C'est le comportement attendu.

## Diagnostic

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:12345/-/ready
docker compose -f docker-compose.devops.yml --profile observability logs alloy --tail=50
```

L'interface d'état d'Alloy est sur <http://localhost:12345>, publiée uniquement sur `127.0.0.1` et
paramétrable par `ALLOY_PORT`.

| Symptôme | Cause probable |
|---|---|
| `Unable to refresh target groups ... Forbidden` | route manquante dans l'allowlist du proxy |
| Aucun conteneur découvert | label de projet Compose différent de `devops-store` |
| Journaux réémis après redémarrage | volume de positions `devops-store-alloy-data` supprimé |
| Proxy arrêté | chien de garde : le socket Docker est devenu indisponible |

L'image Alloy est basée sur Ubuntu et contient `bash` mais ni `curl` ni `wget`. Son `healthcheck`
Docker ouvre donc `/dev/tcp/127.0.0.1/12345` depuis `bash` ; `CMD-SHELL` ne conviendrait pas, car
`/bin/sh` est `dash`, qui n'implémente pas `/dev/tcp`.
