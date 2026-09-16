# Loki

## Rôle et périmètre

Loki stocke les journaux des conteneurs du projet Compose applicatif `devops-store` et les sert à
Grafana. Il est collecté par Grafana Alloy, documenté dans [Alloy](alloy.md). Les profils
`quality`, `artifacts` et `registry` ne sont pas collectés.

L'instance est un binaire unique en mode `all`, avec anneau en mémoire, facteur de réplication 1 et
stockage sur système de fichiers. Elle n'a ni authentification ni multi-tenant : `auth_enabled` vaut
`false` et l'accès est limité au réseau Docker et à `127.0.0.1`.

## Accès et réseaux

Loki écoute sur <http://localhost:3100>, publié uniquement sur `127.0.0.1` et paramétrable par
`LOKI_PORT`. Il rejoint le réseau interne `observability` pour Grafana et Alloy, et le réseau
partagé non interne, nécessaire pour publier le port hôte : un réseau Docker `internal` n'a aucune
connexion aux interfaces de l'hôte.

## Configuration et rétention

La configuration versionnée est `infrastructure/loki/loki-config.yml` :

- schéma `v13` avec index `tsdb` et stockage `filesystem` sous `/loki` ;
- `retention_period: 168h` et compacteur avec `retention_enabled: true` ;
- `reject_old_samples: true` : une entrée plus ancienne que `reject_old_samples_max_age` est
  refusée avec un message explicite ;
- `discover_log_levels: false` : le niveau est déjà posé comme label par Alloy, cette option
  éviterait un `detected_level` redondant en métadonnée structurée ;
- `analytics.reporting_enabled: false`.

Sans compacteur actif, la rétention déclarée ne serait jamais appliquée. Vérifier son démarrage :

```powershell
docker compose -f docker-compose.devops.yml --profile observability logs loki | Select-String -Pattern "compactor"
```

La sortie attendue contient `this instance has been chosen to run the compactor, starting compactor`.

Les données vivent dans le volume nommé `devops-store-loki-data`. `observability-down` le préserve,
`observability-reset` le supprime avec ceux de Prometheus, Grafana et Alloy.

## Commandes

```powershell
make observability-config
make observability-up
make observability-status
make observability-logs
make observability-down
make observability-reset
```

Sans GNU Make, les équivalents Compose sont :

```powershell
docker compose -f docker-compose.devops.yml --profile observability config --quiet
docker compose -f docker-compose.devops.yml --profile observability up -d --wait prometheus grafana socket-proxy loki alloy
docker compose -f docker-compose.devops.yml --profile observability ps prometheus grafana socket-proxy loki alloy
```

La configuration seule se vérifie sans démarrer le service :

```powershell
docker run --rm -v "${PWD}\infrastructure\loki\loki-config.yml:/etc/loki/loki-config.yml:ro" `
  --entrypoint /usr/bin/loki grafana/loki:3.7.7 `
  '-config.file=/etc/loki/loki-config.yml' '-verify-config'
```

Sous PowerShell 5.1, les deux paramètres doivent être passés comme chaînes littérales, sans quoi
l'analyseur les découpe et Loki répond `flag provided but not defined: -config`.

## Requêtes LogQL

Les quatre recherches de référence :

```logql
{service_name="devops-store-backend", level="ERROR"}
{service_name="devops-store-backend", level="WARN"}
{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductController"
{service_name="devops-store-backend"} | json | logger_name =~ ".*ProductService"
```

Les deux dernières filtrent sur le contenu JSON et non sur des labels : `logger_name`, `requestId`,
`thread_name` et `message` restent dans la ligne, ce qui garde l'index à faible cardinalité.

Depuis l'hôte, sans Grafana :

```powershell
curl.exe -s http://localhost:3100/loki/api/v1/labels
curl.exe -s "http://localhost:3100/loki/api/v1/label/service_name/values"
curl.exe -s -G http://localhost:3100/loki/api/v1/query_range `
  --data-urlencode "query={service_name=`"devops-store-backend`"}" --data-urlencode "limit=5"
```

## Diagnostic

| Symptôme | Cause probable | Vérification |
|---|---|---|
| `/ready` répond `503` pendant quelques dizaines de secondes | démarrage normal, anneau pas encore prêt | réessayer, `ready` finit par répondre `200` |
| `error getting ingester clients ... empty ring` au démarrage | erreur transitoire avant enregistrement de l'ingester | disparaît après quelques secondes, aucune action |
| Aucun flux dans Loki | collecteur en défaut | voir [Alloy](alloy.md), pas Loki |
| Entrées refusées | horodatage hors fenêtre `reject_old_samples_max_age` | message explicite dans les journaux de Loki |
| Volume qui grossit | rétention non appliquée | vérifier le démarrage du compacteur |

L'image `grafana/loki:3.7.7` est distroless : elle ne contient ni shell, ni `wget`, ni `curl`. Le
service n'a donc pas de `healthcheck` Docker et sa disponibilité se vérifie depuis l'hôte avec
`curl.exe http://localhost:3100/ready`.

## Limites assumées

- mono-nœud, sans haute disponibilité ni stockage objet distant ;
- pas d'authentification ni de multi-tenant ;
- pas de règles d'alerte : le `ruler` est configuré sur un répertoire local mais aucune règle n'est
  versionnée.
